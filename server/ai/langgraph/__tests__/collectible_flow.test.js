const identify_collectible = require('../nodes/identify_collectible');
const confirm_collectible = require('../nodes/confirm_collectible');
const valuate_collectible = require('../nodes/valuate_collectible');
const describe_collectible = require('../nodes/describe_collectible');
const { openai } = require('../../openaiClient');
const { googleSearchTool } = require('../../langchain/tools/searchTool');
const { performVisualSearch } = require('../../langchain/tools/visualSearchTool');

jest.mock('../../openaiClient');
jest.mock('../../langchain/tools/searchTool');
jest.mock('../../langchain/tools/visualSearchTool');

describe('Sprint 1 Collectible Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up performVisualSearch mock to return empty array by default
    performVisualSearch.mockResolvedValue([]);
    
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

    expect(result1.collectible?.identification?.id).toBe('Action Comic #1');
    expect(result1.collectible?.identification?.category).toBe('Comics');

    // 1.5 Confirm gate (MANDATORY HITL: even high confidence requires human review)
    const result1b = await confirm_collectible(result1);
    expect(result1b.collectible?.review?.status).toBe('pending');
    expect(result1b.finalResult).toBeDefined();
    expect(result1b.finalResult?.collectibleInsights?.identification?.id).toBe('Action Comic #1');
    expect(result1b.finalResult?.collectibleInsights?.identification?.category).toBe('Comics');
    expect(result1b.finalResult?.collectibleInsights?.identification?.confidence).toBe(0.95);
    
    // Graph should terminate here; to proceed, we need a human override
    // Simulate human approval with collectibleOverride
    const humanApproved = await confirm_collectible({
      ...result1,
      collectibleOverride: {
        id: 'Action Comic #1',
        category: 'Comics',
        confirmedBy: 'user-456'
      }
    });
    expect(humanApproved.collectible?.review?.status).toBe('confirmed');

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

    const result2 = await valuate_collectible(humanApproved);

    expect(result2.collectible?.valuation).toBeDefined();
    // low/high must be derived from numeric market_data (NUMERIC CONSISTENCY rule)
    expect(result2.collectible?.valuation?.low).toBe(1500000);
    expect(result2.collectible?.valuation?.high).toBe(1800000);
    expect(result2.collectible?.valuation?.market_data).toBeDefined();
    expect(result2.collectible?.valuation?.market_data).toHaveLength(2);
    expect(result2.collectible?.valuation?.market_data?.[0]?.price).toBe(1500000);
    expect(result2.collectible?.valuation?.market_data?.[0]?.venue).toBe('eBay');
    expect(result2.collectible?.valuation?.market_data?.[0]?.condition_label).toBe('CGC 9.0');
    expect(result2.collectible?.valuation?.market_data?.[1]?.condition_label).toBe('NM+');
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

    // low/high must be derived from numeric market_data (NUMERIC CONSISTENCY rule)
    expect(result.collectible?.valuation?.low).toBe(2500);
    expect(result.collectible?.valuation?.high).toBe(2500);
    expect(result.collectible?.valuation?.market_data?.[0]?.price).toBe(2500);
  });

  test('HITL override: Uses human identification before valuation/description', async () => {
    // If the human provides an override, identify_collectible must NOT call OpenAI.
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

    // Valuation + description should now use the overridden ID.
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            valuation: { low: 40, high: 90, currency: 'USD' },
            market_data: [{ price: 65, venue: 'eBay', url: 'https://example.com', date_seen: '2025-11-30' }],
            reasoning: 'Test override valuation'
          })
        }
      }]
    });

    const valued = await valuate_collectible(confirmed);
    expect(googleSearchTool.invoke).toHaveBeenCalled();

    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            description: 'A classic Pyrex Butterprint bowl with a collector-friendly value range.',
            caption: 'Pyrex Butterprint 403',
            keywords: ['pyrex', 'butterprint', 'kitchenware'],
            priceSources: []
          })
        }
      }]
    });

    const described = await describe_collectible(valued);
    expect(described.finalResult?.collectibleInsights?.identification?.id).toBe('Pyrex Butterprint Mixing Bowl 403');
    expect(described.finalResult?.collectibleInsights?.review?.status).toBe('confirmed');
  });​
265
    openai.chat.completions.create.mockResolvedValueOnce({
266
      choices: [{
267
        message: {
268
          content: JSON.stringify({
269
            description: 'A classic Pyrex Butterprint bowl with a collector-friendly value range.',
270
            caption: 'Pyrex Butterprint 403',
271
            keywords: ['pyrex', 'butterprint', 'kitchenware'],
272
            priceSources: []
273
          })
274
        }
275
      }]
276
    });
277
​
278
    const described = await describe_collectible(valued);
279
    expect(described.finalResult?.collectibleInsights?.identification?.id).toBe('Pyrex Butterprint Mixing Bowl 403');
280
    expect(described.finalResult?.collectibleInsights?.review?.status).toBe('confirmed');
281
  });
282
​
 |  | 
283
 
284
 
  test('HITL pending: Identification is visible in finalResult when review is required', async () => {
285
 
    // Set environment to force review
286
 
    process.env.COLLECTIBLES_FORCE_REVIEW = 'true';
287
 
​
288
 
    // Mock visual search to return Google Lens results
289
 
    performVisualSearch.mockResolvedValueOnce([
290
 
      { title: 'Marvel Power Pack #1 CGC', link: 'https://example.com/powerpack1' }
291
 
    ]);
292
 
​
293
 
    openai.chat.completions.create.mockResolvedValueOnce({
294
 
      choices: [{
295
 
        message: {
296
 
          content: JSON.stringify({
297
 
            id: 'Marvel Power Pack #1',
298
 
            confidence: 0.95,
299
 
            category: 'Comics'
300
 
          })
301
 
        }
302
 
      }]
303
 
    });
304
 
​
305
 
    const state1 = { 
306
 
      imageBase64: 'fake_base64', 
307
 
      imageMime: 'image/jpeg'
308
 
    };
309
 
    const result1 = await identify_collectible(state1);
310
 
​
311
 
    expect(result1.collectible?.identification?.id).toBe('Marvel Power Pack #1');
312
 
    expect(result1.visualMatches).toBeDefined();
313
 
    expect(result1.visualMatches).toHaveLength(1);
314
 
​
315
 
    const result1b = await confirm_collectible(result1);
316
 
    
317
 
    // Should be pending due to forced review
318
 
    expect(result1b.collectible?.review?.status).toBe('pending');
319
 
    
320
 
    // CRITICAL: finalResult must include identification for HITL
321
 
    expect(result1b.finalResult).toBeDefined();
322
 
    expect(result1b.finalResult.description).toBe('AI suggests this identification. Please approve or edit to continue to valuation.');
323
 
    expect(result1b.finalResult.collectibleInsights.identification).toBeDefined();
324
 
    expect(result1b.finalResult.collectibleInsights.identification.id).toBe('Marvel Power Pack #1');
325
 
    expect(result1b.finalResult.collectibleInsights.identification.category).toBe('Comics');
326
 
    expect(result1b.finalResult.collectibleInsights.visualMatches).toBeDefined();
327
 
    expect(result1b.finalResult.collectibleInsights.visualMatches).toHaveLength(1);
328
 
​
329
 
    // Clean up
330
 
    delete process.env.COLLECTIBLES_FORCE_REVIEW;
331
 
332
 
  test('Mandatory HITL: 100% confidence still requires human review', async () => {
333
 
    // Even with perfect confidence (1.0), the system must not auto-confirm
334
 
    const perfectConfidenceState = {
335
 
      imageBase64: 'fake_base64',
336
 
      imageMime: 'image/jpeg',
337
 
      collectible: {
338
 
        identification: {
339
 
          id: 'Mickey Mantle 1952 Topps #311',
340
 
          category: 'Sports Cards',
341
 
          confidence: 1.0, // Perfect confidence
342
 
          fields: { year: '1952', player: 'Mickey Mantle' },
343
 
          source: 'ai',

  test('HITL pending: Identification is visible in finalResult when review is required', async () => {
    // Set environment to force review
    process.env.COLLECTIBLES_FORCE_REVIEW = 'true';

    // Mock visual search to return Google Lens results
    performVisualSearch.mockResolvedValueOnce([
      { title: 'Marvel Power Pack #1 CGC', link: 'https://example.com/powerpack1' }
    ]);

    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            id: 'Marvel Power Pack #1',
            confidence: 0.95,
            category: 'Comics'
          })
        }
      }]
    });

    const state1 = { 
      imageBase64: 'fake_base64', 
      imageMime: 'image/jpeg'
    };
    const result1 = await identify_collectible(state1);

    expect(result1.collectible?.identification?.id).toBe('Marvel Power Pack #1');
    expect(result1.visualMatches).toBeDefined();
    expect(result1.visualMatches).toHaveLength(1);

    const result1b = await confirm_collectible(result1);
    
    // Should be pending due to forced review
    expect(result1b.collectible?.review?.status).toBe('pending');
    
    // CRITICAL: finalResult must include identification for HITL
    expect(result1b.finalResult).toBeDefined();
    expect(result1b.finalResult.description).toBe('AI suggests this identification. Please approve or edit to continue to valuation.');
    expect(result1b.finalResult.collectibleInsights.identification).toBeDefined();
    expect(result1b.finalResult.collectibleInsights.identification.id).toBe('Marvel Power Pack #1');
    expect(result1b.finalResult.collectibleInsights.identification.category).toBe('Comics');
    expect(result1b.finalResult.collectibleInsights.visualMatches).toBeDefined();
    expect(result1b.finalResult.collectibleInsights.visualMatches).toHaveLength(1);

    // Clean up
    delete process.env.COLLECTIBLES_FORCE_REVIEW;
  test('Mandatory HITL: 100% confidence still requires human review', async () => {
    // Even with perfect confidence (1.0), the system must not auto-confirm
    const perfectConfidenceState = {
      imageBase64: 'fake_base64',
      imageMime: 'image/jpeg',
      collectible: {
        identification: {
          id: 'Mickey Mantle 1952 Topps #311',
          category: 'Sports Cards',
          confidence: 1.0, // Perfect confidence
          fields: { year: '1952', player: 'Mickey Mantle' },
          source: 'ai',
        },
      },
    };

    const result = await confirm_collectible(perfectConfidenceState);
    
    // Must be pending, never auto-confirmed
    expect(result.collectible?.review?.status).toBe('pending');
    expect(result.finalResult).toBeDefined();
    
    // finalResult must include identification data for Edit Page
    expect(result.finalResult?.collectibleInsights?.identification?.id).toBe('Mickey Mantle 1952 Topps #311');
    expect(result.finalResult?.collectibleInsights?.identification?.category).toBe('Sports Cards');
    expect(result.finalResult?.collectibleInsights?.identification?.confidence).toBe(1.0);
    expect(result.finalResult?.collectibleInsights?.identification?.source).toBe('ai');
    
    // Verify that finalResult includes pending review status
    expect(result.finalResult?.collectibleInsights?.review?.status).toBe('pending');
  });

  test('HITL gate: Low confidence also requires review', async () => {
    const lowConfidenceState = {
      imageBase64: 'fake_base64',
      imageMime: 'image/jpeg',
      collectible: {
        identification: {
          id: 'Unknown Vintage Item',
          category: 'Antiques',
          confidence: 0.45, // Low confidence
          fields: null,
          source: 'ai',
        },
      },
    };

    const result = await confirm_collectible(lowConfidenceState);
    
    expect(result.collectible?.review?.status).toBe('pending');
    expect(result.finalResult?.collectibleInsights?.identification?.confidence).toBe(0.45);
    expect(result.finalResult?.collectibleInsights?.review?.status).toBe('pending');
  });
});
