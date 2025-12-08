const { openai } = require('../../openaiClient');
const { googleSearchTool } = require('../../langchain/tools/searchTool');
const logger = require('../../../logger');

/**
 * Sanitize a price string/number to a valid float.
 * Strips currency symbols ($), commas, and whitespace.
 * @param {string|number} value - The price value to sanitize
 * @returns {number|null} - Sanitized float or null if invalid
 */
function sanitizePrice(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    // Remove $, commas, whitespace
    const cleaned = value.replace(/[$,\s]/g, '').trim();
    if (!cleaned) return null;
    const parsed = parseFloat(cleaned);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Validate URL string (basic sanity check).
 * @param {string} url - URL to validate
 * @returns {string|null} - Valid URL or null
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.length > 2048) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  return trimmed;
}

const VALUATE_SYSTEM_PROMPT = `You are a professional appraiser.
Your goal is to determine the market value of a collectible item based on search results.
You MUST return a JSON object with this exact schema:
{
  "valuation": {
    "low": <number or null>,
    "high": <number or null>,
    "currency": "USD"
  },
  "market_data": [
    {
      "price": <number - NO currency symbols or commas, just the numeric value>,
      "venue": "<string - e.g. 'eBay', 'Heritage Auctions', 'GoCollect'>",
      "url": "<string - the specific source URL>",
      "date_seen": "<string - ISO date format YYYY-MM-DD>"
    }
  ],
  "reasoning": "<string>"
}

IMPORTANT:
- Extract EACH individual price point you find into the market_data array.
- The "price" field MUST be a plain number (e.g., 1200.00), NOT a string with $ or commas.
- If you cannot find a price, set valuation.low and valuation.high to null and market_data to an empty array.
- Do not make up numbers.`;

async function valuate_collectible(state) {
  try {
    logger.info('[LangGraph] valuate_collectible: Enter');
    logger.info('[LangGraph] valuate_collectible: Enter with state', {
      collectible_id: state.collectible_id || null,
      collectible_category: state.collectible_category || null,
      classification: state.classification || null,
      classification_raw: state.classification_raw || null,
      hasCollectibleId: !!state.collectible_id,
    });

    const { collectible_id, collectible_category } = state;

    if (!collectible_id) {
      logger.warn('[LangGraph] valuate_collectible: No ID found, skipping', {
        classification: state.classification || null,
        classification_raw: state.classification_raw || null,
        collectible_category: state.collectible_category || null,
      });
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
      const rawValuation = JSON.parse(content);
      
      // Normalize response structure - handle both old and new formats
      let normalizedValuation;
      if (rawValuation.valuation) {
        // New format: { valuation: {...}, market_data: [...] }
        normalizedValuation = {
          low: sanitizePrice(rawValuation.valuation.low),
          high: sanitizePrice(rawValuation.valuation.high),
          currency: rawValuation.valuation.currency || 'USD',
          reasoning: rawValuation.reasoning || '',
          market_data: []
        };
        
        // Process market_data array
        if (Array.isArray(rawValuation.market_data)) {
          const today = new Date().toISOString().split('T')[0];
          normalizedValuation.market_data = rawValuation.market_data
            .map(item => {
              const price = sanitizePrice(item.price);
              if (price === null) return null; // Skip invalid prices
              
              return {
                price,
                venue: item.venue ? String(item.venue).trim() : 'Unknown',
                url: sanitizeUrl(item.url),
                date_seen: item.date_seen || today
              };
            })
            .filter(Boolean); // Remove nulls
        }
      } else {
        // Old format fallback: { low, high, currency, found_at, reasoning }
        normalizedValuation = {
          low: sanitizePrice(rawValuation.low),
          high: sanitizePrice(rawValuation.high),
          currency: rawValuation.currency || 'USD',
          reasoning: rawValuation.reasoning || '',
          found_at: rawValuation.found_at || [],
          market_data: []
        };
      }
      
      valuation = normalizedValuation;
    } catch (e) {
      logger.error('[LangGraph] valuate_collectible: Failed to parse JSON', e);
      return { ...state, error: 'Failed to parse valuation response' };
    }

    logger.info('[LangGraph] valuate_collectible: Valuation', valuation);
    logger.info('[LangGraph] valuate_collectible: Market data points:', valuation.market_data?.length || 0);

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
