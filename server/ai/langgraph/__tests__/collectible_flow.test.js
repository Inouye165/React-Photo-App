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

    // 2. Test valuate_collectible
    googleSearchTool.invoke.mockResolvedValue('Found price $100');
    
    openai.chat.completions.create.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            low: 1000000,
            high: 2000000,
            currency: 'USD',
            found_at: ['http://example.com'],
            reasoning: 'High value item'
          })
        }
      }]
    });

    const result2 = await valuate_collectible(result1);

    expect(result2.collectible_valuation).toBeDefined();
    expect(result2.collectible_valuation.low).toBe(1000000);
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
});
