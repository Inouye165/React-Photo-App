const { openai } = require('../../openaiClient');
const { googleSearchTool } = require('../../langchain/tools/searchTool');
const logger = require('../../../logger');

const VALUATE_SYSTEM_PROMPT = `You are a professional appraiser.
Your goal is to determine the market value of a collectible item based on search results.
You MUST return a JSON object with this exact schema:
{
  "low": <number>,
  "high": <number>,
  "currency": "USD",
  "found_at": ["<url1>", "<url2>"],
  "reasoning": "<string>"
}
If you cannot find a price, set low and high to null.
Do not make up numbers.`;

async function valuate_collectible(state) {
  try {
    logger.info('[LangGraph] valuate_collectible: Enter');
    const { collectible_id, collectible_category } = state;

    if (!collectible_id) {
      logger.warn('[LangGraph] valuate_collectible: No ID found, skipping');
      return state;
    }

    // 1. Sanitize Input (Basic prevention of prompt injection via item names)
    const sanitizedId = collectible_id.replace(/[^\w\s\-\,\.\#]/g, '').trim();
    
    // 2. Prepare Parallel Search Queries
    const queries = [
      `"${sanitizedId}" price value`,
      `"${sanitizedId}" for sale`,
      `"${sanitizedId}" sold listings`
    ];

    logger.info(`[LangGraph] valuate_collectible: Searching for "${sanitizedId}"`);

    // 3. Execute Searches in Parallel
    const searchResults = await Promise.all(
      queries.map(q => googleSearchTool.invoke(q).catch(e => `Error searching for ${q}: ${e.message}`))
    );

    const combinedSearchResults = searchResults.join('\n\n');

    // 4. Synthesize with LLM
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: VALUATE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Item: ${sanitizedId} (Category: ${collectible_category})
          
Search Results:
${combinedSearchResults}

Determine the value range.`
        }
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    let valuation;
    try {
      valuation = JSON.parse(content);
    } catch (e) {
      logger.error('[LangGraph] valuate_collectible: Failed to parse JSON', e);
      return { ...state, error: 'Failed to parse valuation response' };
    }

    logger.info('[LangGraph] valuate_collectible: Valuation', valuation);

    return {
      ...state,
      collectible_valuation: valuation,
    };

  } catch (err) {
    logger.error('[LangGraph] valuate_collectible: Error', err);
    return { ...state, error: err.message };
  }
}

module.exports = valuate_collectible;
