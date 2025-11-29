/**
 * describe_collectible.js - LangGraph Node
 * 
 * Generates rich, narrative descriptions for collectible items.
 * Takes the analysis from handle_collectible and creates a compelling
 * description that includes:
 * - Item identification and category
 * - Condition assessment
 * - Valuation with sources cited
 * - Notable features and specifics
 * - Search findings summary
 * 
 * This is the collectibles equivalent of generate_metadata for scenery.
 */

const { openai } = require('../../openaiClient');
const logger = require('../../../logger');

const DESCRIBE_COLLECTIBLE_SYSTEM_PROMPT = `You are a collectibles expert writing engaging descriptions for a photo catalog app.

Your task is to take structured collectible analysis data and transform it into a rich, informative narrative description that collectors will appreciate.

**Writing Style:**
- Write in a confident, knowledgeable tone like an expert appraiser
- Be specific about identifying features and why they matter
- ALWAYS mention specific prices found and cite the source (e.g., "According to GoCollect, this issue sells for $15-$30" or "Recent eBay sold listings show prices of $25-$45")
- Include interesting facts about the item's history or collectibility when relevant
- Keep it concise but informative (3-5 sentences)

**What to Include:**
1. What the item IS (category, maker, pattern/series if known)
2. Condition assessment with brief reasoning
3. Estimated value range WITH the specific source cited (website name + price found)
4. One notable/interesting detail about the item

**Output Format:**
Return a JSON object with:
{
  "description": "Your narrative description here (3-5 sentences, MUST include prices and sources)",
  "caption": "A catchy, short headline (5-10 words)",
  "keywords": ["keyword1", "keyword2", ...] (up to 8 relevant keywords),
  "priceSources": [
    {
      "source": "Website name",
      "url": "https://...",
      "priceFound": "$XX - $XX",
      "notes": "Brief note about this source"
    }
  ]
}

**Example Output:**
{
  "description": "This Pyrex Butterprint bowl in the classic turquoise-on-white colorway dates from the 1957-1968 production era. The piece shows typical light wear consistent with regular use but retains its vibrant color. According to recent eBay sold listings, similar pieces in this condition typically fetch $25-$45, while Etsy shows prices ranging from $30-$50 for mint examples. The Butterprint pattern, featuring Amish-inspired farm scenes, remains one of the most sought-after vintage Pyrex designs.",
  "caption": "Vintage Pyrex Butterprint Bowl - Turquoise",
  "keywords": ["Pyrex", "Butterprint", "vintage", "turquoise", "1950s", "collectible", "kitchenware", "Amish"],
  "priceSources": [
    {"source": "eBay Sold Listings", "url": "https://ebay.com/...", "priceFound": "$25-$45", "notes": "Good condition examples"},
    {"source": "Etsy", "url": "https://etsy.com/...", "priceFound": "$30-$50", "notes": "Mint condition asking prices"}
  ]
}`;

/**
 * Generate a rich description for a collectible item
 * 
 * @param {Object} state - LangGraph state containing collectibleResult
 * @returns {Object} Updated state with enhanced finalResult description
 */
async function describe_collectible(state) {
  try {
    logger.info('[LangGraph] describe_collectible node invoked');

    // Check if we have collectible data to work with
    const collectibleResult = state.collectibleResult;
    if (!collectibleResult || collectibleResult.status !== 'success' || !collectibleResult.collectibleData) {
      logger.warn('[LangGraph] describe_collectible: No valid collectible data, using fallback');
      return {
        ...state,
        finalResult: state.finalResult || {
          caption: 'Collectible Item',
          description: 'This appears to be a collectible item. Analysis was not available.',
          keywords: ['collectible'],
          classification: state.classification
        }
      };
    }

    const { cleanData, fullAnalysis } = collectibleResult.collectibleData;

    // Build context for the description generator
    const analysisContext = {
      category: cleanData.category,
      condition: cleanData.condition,
      value: cleanData.value,
      specifics: cleanData.specifics,
      // Include reasoning from full analysis for richer context
      categoryReasoning: fullAnalysis.category?.reasoning,
      conditionReasoning: fullAnalysis.condition?.reasoning,
      valueReasoning: fullAnalysis.value?.reasoning,
      // Include confidence levels
      confidences: {
        category: fullAnalysis.category?.confidence,
        condition: fullAnalysis.condition?.confidence,
        value: fullAnalysis.value?.confidence
      }
    };

    // Include intermediate steps (search results) if available - pass full results for source extraction
    const searchResults = state.collectibleSearchResults || [];
    
    // Parse search results to extract actual URLs and snippets
    const formattedSearchResults = searchResults.map(result => {
      try {
        // The observation contains the JSON stringified results from the search tool
        const parsed = typeof result.observation === 'string' 
          ? JSON.parse(result.observation) 
          : result.observation;
        return {
          query: parsed?.query || 'Unknown query',
          results: Array.isArray(parsed?.results) ? parsed.results : []
        };
      } catch {
        return { query: 'Unknown', results: [] };
      }
    });

    // Flatten all search results for the prompt
    const allSearchResults = formattedSearchResults.flatMap(sr => sr.results);
    
    const userPrompt = `Generate a rich description for this collectible:

**Analysis Data:**
${JSON.stringify(analysisContext, null, 2)}

**Search Results Found (USE THESE FOR PRICING AND SOURCES):**
${allSearchResults.length > 0 ? allSearchResults.map((r, i) => `
${i + 1}. Source: ${r.displayLink || r.source || 'Unknown'}
   Title: ${r.title || 'No title'}
   URL: ${r.link || 'No URL'}
   Snippet: ${r.snippet || 'No snippet'}
`).join('\n') : 'No search results available'}

CRITICAL INSTRUCTIONS:
1. Include the ACTUAL price range found in the search results in your description
2. Cite the SPECIFIC source websites by name (e.g., "According to GoCollect..." or "eBay sold listings show...")
3. Include the priceSources array with real URLs from the search results above
4. If no price data was found in search results, mention that in the description

Create an engaging description that a collector would appreciate.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: DESCRIBE_COLLECTIBLE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 512,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    let parsed;
    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      logger.error('[LangGraph] describe_collectible: Failed to parse response', {
        error: parseError.message,
        raw: response.choices[0].message.content?.substring(0, 500)
      });
      // Fall back to template description
      parsed = {
        description: `This ${cleanData.category} is in ${cleanData.condition.label} condition. Estimated value: $${cleanData.value.min}-$${cleanData.value.max} ${cleanData.value.currency}.`,
        caption: `${cleanData.category} - ${cleanData.condition.label}`,
        keywords: [cleanData.category, cleanData.condition.label, 'collectible']
      };
    }

    logger.info('[LangGraph] describe_collectible: Generated rich description', {
      captionLength: parsed.caption?.length,
      descriptionLength: parsed.description?.length,
      keywordCount: parsed.keywords?.length,
      priceSourcesCount: parsed.priceSources?.length || 0
    });

    // Build the enhanced final result with price sources
    const enhancedFinalResult = {
      caption: parsed.caption || `${cleanData.category} - ${cleanData.condition.label}`,
      description: parsed.description,
      keywords: parsed.keywords || [cleanData.category, cleanData.condition.label],
      classification: state.classification,
      collectibleInsights: {
        category: cleanData.category,
        condition: cleanData.condition,
        valuation: {
          lowEstimateUSD: cleanData.value.min,
          highEstimateUSD: cleanData.value.max,
          currency: cleanData.value.currency,
          reasoning: fullAnalysis.value?.reasoning,
          priceSources: parsed.priceSources || []
        },
        specifics: cleanData.specifics,
        confidences: {
          category: fullAnalysis.category?.confidence,
          condition: fullAnalysis.condition?.confidence,
          value: fullAnalysis.value?.confidence
        },
        searchResultsUsed: allSearchResults.length
      }
    };

    return {
      ...state,
      finalResult: enhancedFinalResult,
      error: null
    };
  } catch (err) {
    logger.error('[LangGraph] describe_collectible: Error', {
      error: err.message,
      stack: err.stack
    });
    
    // Return state with existing finalResult on error
    return {
      ...state,
      error: err.message || String(err)
    };
  }
}

module.exports = describe_collectible;
