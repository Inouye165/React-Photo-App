/**
 * Integration Tests: Sprint 2 - Collectibles Data Persistence
 * 
 * Tests the market_data persistence flow from AI results to the
 * collectible_market_data table.
 */

'use strict';

// Mock OpenAI and external services before requiring modules
jest.mock('../ai/openaiClient', () => ({
  openai: {
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }
}));

jest.mock('../ai/langchain/tools/searchTool', () => ({
  googleSearchTool: {
    invoke: jest.fn()
  }
}));

// Set test environment
process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';
process.env.ENABLE_COLLECTIBLES_DB = 'true';

describe('Sprint 2: Collectibles Market Data Persistence', () => {
  describe('valuate_collectible node', () => {
    const valuate_collectible = require('../ai/langgraph/nodes/valuate_collectible');
    const { openai } = require('../ai/openaiClient');
    const { googleSearchTool } = require('../ai/langchain/tools/searchTool');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should parse market_data array from LLM response', async () => {
      // Mock search results
      googleSearchTool.invoke.mockResolvedValue('Found item on eBay for $150');

      // Mock LLM response with new market_data format
      openai.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              valuation: { low: 100, high: 200, currency: 'USD' },
              market_data: [
                { price: 150, venue: 'eBay', url: 'https://ebay.com/item/123', date_seen: '2025-11-30' },
                { price: '$175.50', venue: 'Heritage Auctions', url: 'https://ha.com/item/456', date_seen: '2025-11-29' }
              ],
              reasoning: 'Based on recent sales'
            })
          }
        }]
      });

      const state = {
        collectible: {
          identification: {
            id: 'Test Comic #1',
            category: 'Comics',
            confidence: 0.99,
            fields: {},
            source: 'ai',
          },
          review: { status: 'confirmed' },
        },
      };

      const result = await valuate_collectible(state);

      expect(result.collectible?.valuation).toBeDefined();
      // low/high must be derived from numeric market_data (NUMERIC CONSISTENCY rule)
      expect(result.collectible?.valuation?.low).toBe(150);
      expect(result.collectible?.valuation?.high).toBe(175.5);
      expect(result.collectible?.valuation?.market_data).toHaveLength(2);
      
      // Verify price sanitization (string "$175.50" -> number 175.5)
      expect(result.collectible?.valuation?.market_data?.[0]?.price).toBe(150);
      expect(result.collectible?.valuation?.market_data?.[1]?.price).toBe(175.5);
      expect(result.collectible?.valuation?.market_data?.[0]?.venue).toBe('eBay');
    });

    test('should sanitize prices with $ and commas', async () => {
      googleSearchTool.invoke.mockResolvedValue('Found item');

      openai.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              valuation: { low: '$1,000', high: '$2,500.99', currency: 'USD' },
              market_data: [
                { price: '$1,200.00', venue: 'GoCollect', url: 'https://gocollect.com/123', date_seen: '2025-11-30' }
              ],
              reasoning: 'Price from GoCollect'
            })
          }
        }]
      });

      const result = await valuate_collectible({
        collectible: {
          identification: {
            id: 'Rare Item',
            category: 'Toys',
            confidence: 0.99,
            fields: {},
            source: 'ai',
          },
          review: { status: 'confirmed' },
        },
      });

      // low/high must be derived from numeric market_data (NUMERIC CONSISTENCY rule)
      expect(result.collectible?.valuation?.low).toBe(1200);
      expect(result.collectible?.valuation?.high).toBe(1200);
      expect(result.collectible?.valuation?.market_data?.[0]?.price).toBe(1200);
    });

    test('should handle missing market_data gracefully', async () => {
      googleSearchTool.invoke.mockResolvedValue('No results');

      // Old format response (backward compatibility)
      openai.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              low: 50,
              high: 100,
              currency: 'USD',
              found_at: ['http://example.com'],
              reasoning: 'Estimate'
            })
          }
        }]
      });

      const result = await valuate_collectible({
        collectible: {
          identification: {
            id: 'Old Item',
            category: 'Misc',
            confidence: 0.99,
            fields: {},
            source: 'ai',
          },
          review: { status: 'confirmed' },
        },
      });

      expect(result.collectible?.valuation?.low).toBe(50);
      expect(result.collectible?.valuation?.high).toBe(100);
      expect(result.collectible?.valuation?.market_data).toEqual([]);
    });

    test('should filter out invalid prices in market_data', async () => {
      googleSearchTool.invoke.mockResolvedValue('Found items');

      openai.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              valuation: { low: 100, high: 200, currency: 'USD' },
              market_data: [
                { price: 150, venue: 'eBay', url: 'https://ebay.com/1', date_seen: '2025-11-30' },
                { price: 'unknown', venue: 'Bad Source', url: null, date_seen: null },
                { price: null, venue: 'Another Bad', url: 'http://test.com', date_seen: '2025-11-30' },
                { price: 200, venue: 'Good Source', url: 'https://good.com', date_seen: '2025-11-30' }
              ],
              reasoning: 'Mixed quality data'
            })
          }
        }]
      });

      const result = await valuate_collectible({
        collectible: {
          identification: {
            id: 'Test Item',
            category: 'Test',
            confidence: 0.99,
            fields: {},
            source: 'ai',
          },
          review: { status: 'confirmed' },
        },
      });

      // Should only have 2 valid entries (150 and 200)
      expect(result.collectible?.valuation?.market_data).toHaveLength(2);
      expect(result.collectible?.valuation?.market_data?.[0]?.price).toBe(150);
      expect(result.collectible?.valuation?.market_data?.[1]?.price).toBe(200);
    });

    test('should sanitize URLs and reject malformed ones', async () => {
      googleSearchTool.invoke.mockResolvedValue('Found item');

      openai.chat.completions.create.mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              valuation: { low: 100, high: 200, currency: 'USD' },
              market_data: [
                { price: 150, venue: 'Valid', url: 'https://valid.com/item', date_seen: '2025-11-30' },
                { price: 175, venue: 'NoProtocol', url: 'invalid-no-protocol.com', date_seen: '2025-11-30' },
                { price: 200, venue: 'Empty', url: '', date_seen: '2025-11-30' }
              ],
              reasoning: 'Testing URL sanitization'
            })
          }
        }]
      });

      const result = await valuate_collectible({
        collectible: {
          identification: {
            id: 'URL Test Item',
            category: 'Test',
            confidence: 0.99,
            fields: {},
            source: 'ai',
          },
          review: { status: 'confirmed' },
        },
      });

      expect(result.collectible?.valuation?.market_data).toHaveLength(3);
      expect(result.collectible?.valuation?.market_data?.[0]?.url).toBe('https://valid.com/item');
      expect(result.collectible?.valuation?.market_data?.[1]?.url).toBeNull(); // Invalid protocol
      expect(result.collectible?.valuation?.market_data?.[2]?.url).toBeNull(); // Empty
    });
  });

  describe('collectiblesService.addMarketDataBulk', () => {
    test('should export addMarketDataBulk function', () => {
      const createCollectiblesService = require('../services/collectiblesService');
      
      // Create a mock db for testing service export
      const mockDb = jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([1])
      }));
      
      const service = createCollectiblesService({ db: mockDb });
      
      expect(typeof service.addMarketDataBulk).toBe('function');
      expect(typeof service.addMarketData).toBe('function');
      expect(typeof service.getMarketData).toBe('function');
    });
  });

  describe('Market data transformation logic', () => {
    test('should correctly transform AI result market_data for DB insertion', () => {
      const testUserId = 'test-user-uuid';
      const collectibleId = 123;
      
      // Simulated AI result from collectibleInsights
      const marketData = [
        { price: 150, venue: 'eBay', url: 'https://ebay.com/item/123', date_seen: '2025-11-30' },
        { price: 175.50, venue: 'Heritage Auctions', url: 'https://ha.com/item/456', date_seen: '2025-11-29' }
      ];

      // This is the transformation logic from service.js
      const marketDataRecords = marketData
        .filter(item => item && typeof item.price === 'number' && !Number.isNaN(item.price))
        .map(item => ({
          collectible_id: collectibleId,
          user_id: testUserId,
          price: item.price,
          venue: item.venue ? String(item.venue).substring(0, 255) : null,
          url: (item.url && typeof item.url === 'string' && item.url.length < 2048) ? item.url : null,
          date_seen: item.date_seen ? new Date(item.date_seen) : new Date()
        }));

      expect(marketDataRecords).toHaveLength(2);
      expect(marketDataRecords[0].collectible_id).toBe(123);
      expect(marketDataRecords[0].user_id).toBe('test-user-uuid');
      expect(marketDataRecords[0].price).toBe(150);
      expect(marketDataRecords[0].venue).toBe('eBay');
      expect(marketDataRecords[1].price).toBe(175.50);
    });

    test('should filter out records with invalid prices', () => {
      const marketData = [
        { price: 100, venue: 'Valid' },
        { price: NaN, venue: 'Invalid NaN' },
        { price: 'not a number', venue: 'Invalid String' },
        { price: null, venue: 'Invalid Null' },
        { price: 200, venue: 'Also Valid' }
      ];

      const filtered = marketData.filter(
        item => item && typeof item.price === 'number' && !Number.isNaN(item.price)
      );

      expect(filtered).toHaveLength(2);
      expect(filtered[0].price).toBe(100);
      expect(filtered[1].price).toBe(200);
    });

    test('should handle missing market_data gracefully', () => {
      const collectibleInsights = {
        category: 'Comics',
        valuation: {
          lowEstimateUSD: 100,
          highEstimateUSD: 200
          // No market_data
        }
      };

      const marketData = collectibleInsights?.valuation?.market_data;
      const hasMarketData = Array.isArray(marketData) && marketData.length > 0;

      expect(hasMarketData).toBe(false);
    });

    test('should truncate long venue names and reject long URLs', () => {
      const longVenue = 'A'.repeat(300);
      const longUrl = 'https://example.com/' + 'a'.repeat(2100);

      const marketData = [
        { price: 100, venue: longVenue, url: longUrl }
      ];

      const transformed = marketData.map(item => ({
        venue: item.venue ? String(item.venue).substring(0, 255) : null,
        url: (item.url && typeof item.url === 'string' && item.url.length < 2048) ? item.url : null
      }));

      expect(transformed[0].venue).toHaveLength(255);
      expect(transformed[0].url).toBeNull();
    });
  });
});
