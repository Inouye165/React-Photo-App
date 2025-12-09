const identify_collectible = require('../nodes/identify_collectible');
const valuate_collectible = require('../nodes/valuate_collectible');
const describe_collectible = require('../nodes/describe_collectible');
const { openai } = require('../../openaiClient');
const { googleSearchTool } = require('../../langchain/tools/searchTool');

jest.mock('../../openaiClient');
jest.mock('../../langchain/tools/searchTool');

describe('Sprint 1 Collectible Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up googleSearchTool mock with schema validation
    googleSearchTool.invoke.mockImplementation(async (input) => {
      // Validate input shape matches Zod schema
      expect(input).toEqual(
        expect.objectContaining({
          query: expect.any(String),
          numResults: expect.any(Number),
        })
      );
      expect(typeof input).toBe('object');
      expect(typeof input.query).toBe('string');
      expect(input.query.length).toBeGreaterThan(0);
      
      return JSON.stringify({
        query: input.query,
        fetchedAt: new Date().toISOString(),
        results: [
          { title: 'Mock Result', link: 'https://example.com', snippet: 'Found price $1,500,000 on eBay' }
        ]
      });
    });
  });

  test('Full flow: Identify -> Valuate -> Describe', async () => {
    // 1. Test identify_collectible
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            id: 'Action Comic #1',
            confidence: 0.95,
            category: 'Comics'
          })
        }
      }]
    });

    const state1 = { imageBase64: 'fake_base64', imageMime: 'image/jpeg' };
    const result1 = await identify_collectible(state1);

    expect(result1.collectible_id).toBe('Action Comic #1');
    expect(result1.collectible_category).toBe('Comics');

    // 2. Test valuate_collectible (Sprint 2: now returns market_data array)
    // Note: googleSearchTool.invoke is already mocked in beforeEach with schema validation
    
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            valuation: {
              low: 1000000,
              high: 2000000,
              currency: 'USD'
            },
            market_data: [
              { price: 1500000, venue: 'eBay', url: 'https://ebay.com/item/action-comic-1', date_seen: '2025-11-30', condition_label: 'CGC 9.0' },
              { price: 1800000, venue: 'Heritage Auctions', url: 'https://ha.com/action-comic', date_seen: '2025-11-29', condition_label: 'NM+' }
            ],
            reasoning: 'High value item based on recent auction sales'
          })
        }
      }]
    });

    const result2 = await valuate_collectible(result1);

    expect(result2.collectible_valuation).toBeDefined();
    expect(result2.collectible_valuation.low).toBe(1000000);
    expect(result2.collectible_valuation.high).toBe(2000000);
    expect(result2.collectible_valuation.market_data).toBeDefined();
    expect(result2.collectible_valuation.market_data).toHaveLength(2);
    expect(result2.collectible_valuation.market_data[0].price).toBe(1500000);
    expect(result2.collectible_valuation.market_data[0].venue).toBe('eBay');
    expect(result2.collectible_valuation.market_data[0].condition_label).toBe('CGC 9.0');
    expect(result2.collectible_valuation.market_data[1].condition_label).toBe('NM+');
    expect(googleSearchTool.invoke).toHaveBeenCalledTimes(3);

    // 3. Test describe_collectible
    // Note: describe_collectible does NOT use OpenAI in the Sprint 1 path logic I added?
    // Wait, describe_collectible DOES use OpenAI to generate the description text.
    // I need to mock that too.
    
    // Actually, looking at describe_collectible.js, it constructs analysisContext but then...
    // I need to check if it calls OpenAI.
    // Yes, it imports openai.
    
    // Let's check describe_collectible implementation again.
    // It builds analysisContext, then calls OpenAI to generate description.
    
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            description: 'A very expensive comic book.',
            caption: 'Action Comic #1',
            keywords: ['comic', 'superman'],
            priceSources: []
          })
        }
      }]
    });

    const result3 = await describe_collectible(result2);

    expect(result3.finalResult).toBeDefined();
    expect(result3.finalResult.description).toBe('A very expensive comic book.');
    
    // Verify the context passed to OpenAI (optional, but good for debugging)
    // const lastCall = openai.chat.completions.create.mock.calls[2]; // 0=identify, 1=valuate, 2=describe
    // We can inspect lastCall if needed
  });

  test('Valuate handles old format response (backward compatibility)', async () => {
    // googleSearchTool is already mocked in beforeEach with schema validation

    // Old format response (without nested valuation object)
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            low: 400,
            high: 600,
            currency: 'USD',
            found_at: ['http://example.com/item'],
            reasoning: 'Based on comparable sales'
          })
        }
      }]
    });

    const result = await valuate_collectible({
      collectible_id: 'Vintage Toy',
      collectible_category: 'Toys'
    });

    expect(result.collectible_valuation).toBeDefined();
    expect(result.collectible_valuation.low).toBe(400);
    expect(result.collectible_valuation.high).toBe(600);
    expect(result.collectible_valuation.market_data).toEqual([]);
    expect(result.collectible_valuation.found_at).toContain('http://example.com/item');
  });

  test('Valuate sanitizes price strings with $ and commas', async () => {
    // googleSearchTool is already mocked in beforeEach with schema validation

    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            valuation: { low: '$1,234.56', high: '$5,678.90', currency: 'USD' },
            market_data: [
              { price: '$2,500.00', venue: 'Test Store', url: 'https://test.com', date_seen: '2025-11-30' }
            ],
            reasoning: 'Test sanitization'
          })
        }
      }]
    });

    const result = await valuate_collectible({
      collectible_id: 'Test Item',
      collectible_category: 'Test'
    });

    expect(result.collectible_valuation.low).toBe(1234.56);
    expect(result.collectible_valuation.high).toBe(5678.90);
    expect(result.collectible_valuation.market_data[0].price).toBe(2500);
  });
});
