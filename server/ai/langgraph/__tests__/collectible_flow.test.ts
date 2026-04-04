const identify_collectible = require('../nodes/identify_collectible');
const confirm_collectible = require('../nodes/confirm_collectible');
const valuate_collectible = require('../nodes/valuate_collectible');
const describe_collectible = require('../nodes/describe_collectible');
const { openai } = require('../../openaiClient');
const { googleSearchTool } = require('../../langchain/tools/searchTool');

jest.mock('../../openaiClient');
jest.mock('../../langchain/tools/searchTool');

describe('Sprint 1 Collectible Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    googleSearchTool.invoke.mockImplementation(async (input) => {
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
        results: [{ title: 'Mock Result', link: 'https://example.com', snippet: 'Found price $1,500,000 on eBay' }],
      });
    });
  });

  test('Full flow: Identify -> Valuate -> Describe', async () => {
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            id: 'Action Comic #1',
            confidence: 0.95,
            category: 'Comics',
          }),
        },
      }],
    });

    const state1 = { imageBase64: 'fake_base64', imageMime: 'image/jpeg' };
    const result1 = await identify_collectible(state1);

    expect(result1.collectible?.identification?.id).toBe('Action Comic #1');
    expect(result1.collectible?.identification?.category).toBe('Comics');

    const result1b = await confirm_collectible(result1);
    expect(result1b.collectible?.review?.status).toBe('pending');
    expect(result1b.finalResult).toBeDefined();
    expect(result1b.finalResult?.collectibleInsights?.identification?.id).toBe('Action Comic #1');
    expect(result1b.finalResult?.collectibleInsights?.identification?.category).toBe('Comics');
    expect(result1b.finalResult?.collectibleInsights?.identification?.confidence).toBe(0.95);

    const humanApproved = await confirm_collectible({
      ...result1,
      collectibleOverride: {
        id: 'Action Comic #1',
        category: 'Comics',
        confirmedBy: 'user-456',
      },
    });
    expect(humanApproved.collectible?.review?.status).toBe('confirmed');

    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            valuation: {
              low: 1000000,
              high: 2000000,
              currency: 'USD',
            },
            market_data: [
              { price: 1500000, venue: 'eBay', url: 'https://ebay.com/item/action-comic-1', date_seen: '2025-11-30', condition_label: 'CGC 9.0' },
              { price: 1800000, venue: 'Heritage Auctions', url: 'https://ha.com/action-comic', date_seen: '2025-11-29', condition_label: 'NM+' },
            ],
            reasoning: 'High value item based on recent auction sales',
          }),
        },
      }],
    });

    const result2 = await valuate_collectible(humanApproved);

    expect(result2.collectible?.valuation).toBeDefined();
    expect(result2.collectible?.valuation?.low).toBe(1500000);
    expect(result2.collectible?.valuation?.high).toBe(1800000);
    expect(result2.collectible?.valuation?.market_data).toBeDefined();
    expect(result2.collectible?.valuation?.market_data).toHaveLength(2);
    expect(result2.collectible?.valuation?.market_data?.[0]?.price).toBe(1500000);
    expect(result2.collectible?.valuation?.market_data?.[0]?.venue).toBe('eBay');
    expect(result2.collectible?.valuation?.market_data?.[0]?.condition_label).toBe('CGC 9.0');
    expect(result2.collectible?.valuation?.market_data?.[1]?.condition_label).toBe('NM+');
    expect(googleSearchTool.invoke).toHaveBeenCalledTimes(3);

    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            description: 'A very expensive comic book.',
            caption: 'Action Comic #1',
            keywords: ['comic', 'superman'],
            priceSources: [],
          }),
        },
      }],
    });

    const result3 = await describe_collectible(result2);

    expect(result3.finalResult).toBeDefined();
    expect(result3.finalResult.description).toBe('A very expensive comic book.');
  });

  test('Valuate handles old format response (backward compatibility)', async () => {
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            low: 400,
            high: 600,
            currency: 'USD',
            found_at: ['http://example.com/item'],
            reasoning: 'Based on comparable sales',
          }),
        },
      }],
    });

    const result = await valuate_collectible({
      collectible: {
        identification: {
          id: 'Vintage Toy',
          category: 'Toys',
          confidence: 0.99,
          fields: {},
          source: 'ai',
        },
        review: { status: 'confirmed' },
      },
    });

    expect(result.collectible?.valuation).toBeDefined();
    expect(result.collectible?.valuation?.low).toBe(400);
    expect(result.collectible?.valuation?.high).toBe(600);
    expect(result.collectible?.valuation?.market_data).toEqual([]);
    expect(result.collectible?.valuation?.found_at).toContain('http://example.com/item');
  });

  test('Valuate sanitizes price strings with $ and commas', async () => {
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            valuation: { low: '$1,234.56', high: '$5,678.90', currency: 'USD' },
            market_data: [{ price: '$2,500.00', venue: 'Test Store', url: 'https://test.com', date_seen: '2025-11-30' }],
            reasoning: 'Test sanitization',
          }),
        },
      }],
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

    expect(result.collectible?.valuation?.low).toBe(2500);
    expect(result.collectible?.valuation?.high).toBe(2500);
    expect(result.collectible?.valuation?.market_data?.[0]?.price).toBe(2500);
  });

  test('HITL override: Uses human identification before valuation/description', async () => {
    const overrideState = {
      imageBase64: 'fake_base64',
      imageMime: 'image/jpeg',
      collectibleOverride: {
        id: 'Pyrex Butterprint Mixing Bowl 403',
        category: 'Kitchenware',
        confirmedBy: 'user-123',
      },
    };

    const identified = await identify_collectible(overrideState);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
    expect(identified.collectible?.identification?.id).toBe('Pyrex Butterprint Mixing Bowl 403');
    expect(identified.collectible?.identification?.source).toBe('human');

    const confirmed = await confirm_collectible(identified);
    expect(confirmed.collectible?.review?.status).toBe('confirmed');
    expect(confirmed.collectible?.review?.confirmedBy).toBe('user-123');

    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            valuation: { low: 40, high: 90, currency: 'USD' },
            market_data: [{ price: 65, venue: 'eBay', url: 'https://example.com', date_seen: '2025-11-30' }],
            reasoning: 'Based on comparable sales',
          }),
        },
      }],
    });

    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            description: 'A vintage Pyrex bowl.',
            caption: 'Pyrex Butterprint Mixing Bowl 403',
            keywords: ['pyrex', 'bowl'],
            priceSources: [],
          }),
        },
      }],
    });

    const valuated = await valuate_collectible(confirmed);
    const described = await describe_collectible(valuated);

    expect(described.finalResult?.caption).toBe('Pyrex Butterprint Mixing Bowl 403');
    expect(described.finalResult?.description).toBe('A vintage Pyrex bowl.');
  });
});

export {};