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

You will be given:
- A broad category (e.g., "Comics", "Kitchenware", "Coins", "Trading Cards", etc.)
- A specific identified item name (e.g., "Secret Wars II #3, 1985", "Pyrex Blue Dianthus Cinderella Bowl 443")
- Value and market data (prices, venues, and notes)
- Optional condition or other analysis details

Your goals:
1. Clearly identify what the item is.
2. Add interesting historical or contextual details about the item, its line/series, maker, or era.
3. Explain the value range using the market data.
4. Keep the text concise enough for a mobile app, but rich enough to feel like an expert’s insight.

### Historical / Story Context (generic but category-aware)

Always include at least one short paragraph with *story* or *history*:

- If it’s **Comics**:
  - Mention why this issue or series matters (e.g., crossovers, key characters, creative team, notable events).
  - Optionally mention the era (e.g., “mid-1980s Marvel event” rather than exact dates if you’re unsure).

- If it’s **Kitchenware / Pyrex / Glassware**:
  - Mention the production era or style (e.g., “mid-century kitchenware”, “promotional pattern”, “classic mixing bowl line”).
  - Note what collectors like about the pattern, colors, or form factor.

- If it’s **Coins / Currency**:
  - Mention the historical or political context of the year, the issuing country, or minting changes.
  - Highlight features like composition, design motifs, or commemorative purpose.

- If it’s any **other category**:
  - Mention either the brand’s significance, the series/line, or something interesting about the time period or design style.
  - If you are unsure of exact historical details, keep it general rather than inventing precise facts.

Do **not** fabricate very specific facts (like exact print runs, production counts, or invented storylines) if you are not confident. Prefer slightly general but plausible historical context over precise but speculative claims.

### Value & Market Data

Use the given value and market data to ground your description:

- Explain the low–high range in plain language.
- Refer explicitly to sources (e.g., “According to PriceCharting…”, “A CBCS 9.6 graded copy on MyComicShop…”).
- Tie higher prices to better condition or grading when that’s indicated in the data (e.g., “graded 9.6”, “near mint”, “pristine cookware set”).

### Style

- Tone: confident, expert, and collector-friendly.
- Focus: the item, why it’s interesting, and how the market sees it.
- Avoid: talking about the app UI, JSON, or internal data structures.
- Be honest about uncertainty (e.g., “This issue is part of a major 1980s Marvel crossover event” vs. “This issue introduced X character” if that’s not clearly supported).

### Output Format (JSON)

You MUST return a JSON object with this exact structure:

{
  "description": "<one or two rich paragraphs about the item, its story/history, and its market context>",
  "caption": "<short, catchy caption for the photo>",
  "keywords": ["<keyword1>", "<keyword2>", "<etc>"],
  "priceSources": [
    {
      "source": "<site or venue name, e.g. 'PriceCharting', 'MyComicShop', 'eBay'>",
      "url": "<string - the URL used or inferred>",
      "priceFound": "<string representation of the relevant price or range, e.g. '$3.88 - $21.72'>",
      "notes": "<short explanation of what this price represents (e.g. 'ungraded copies', 'CBCS 9.6 graded copy', 'recent auction result')>"
    }
  ]
}

Rules:
- Do NOT include any extra top-level fields.
- Do NOT output anything that is not valid JSON.
- Do NOT mention that you are an AI model or reference the prompt.`;

/**
 * Generate a rich description for a collectible item
 * 
 * @param {Object} state - LangGraph state containing collectibleResult
 * @returns {Object} Updated state with enhanced finalResult description
 */
async function describe_collectible(state) {
  try {
    logger.info('[LangGraph] describe_collectible node invoked');

    const collectible = state.collectible || null;
    const identification = collectible?.identification || null;
    const review = collectible?.review || null;
    const valuation = collectible?.valuation || null;

    // Check if we have collectible data to work with
    let analysisContext = {};
    
    // Sprint 1 Optimization Path
    if (identification?.id && valuation) {
      logger.info('[LangGraph] describe_collectible: Using Sprint 1 optimized data');
      analysisContext = {
        category: identification.category || 'Collectible',
        condition: { label: 'Not assessed in rapid mode' },
        value: { 
          min: valuation.low, 
          max: valuation.high, 
          currency: valuation.currency 
        },
        specifics: { "Identified Item": identification.id },
        categoryReasoning: `Identified as ${identification.id} with confidence ${identification.confidence}`,
        valueReasoning: valuation.reasoning,
        confidences: {
          category: identification.confidence,
          value: 0.8
        }
      };
    } 
    // Legacy Path
    else {
      const collectibleResult = state.collectibleResult;
      if (!collectibleResult || collectibleResult.status !== 'success' || !collectibleResult.collectibleData) {
        logger.info('[LangGraph] describe_collectible: Using generic fallback (no valuation/collectibleResult)', {
          collectible_id: identification?.id || null,
          hasValuation: !!valuation,
          hasCollectibleResult: !!state.collectibleResult,
          error: state.error || null,
        });
        logger.warn('[LangGraph] describe_collectible: No valid collectible data, using fallback');
        return {
          ...state,
          finalResult: state.finalResult || {
            caption: 'Collectible Item',
            description: 'This appears to be a collectible item. Analysis was not available.',
            keywords: ['collectible'],
            classification: state.classification,
            collectibleInsights: {
              identification: identification || null,
              review: review || null,
            }
          }
        };
      }

      const { cleanData, fullAnalysis } = collectibleResult.collectibleData;

      // Build context for the description generator
      analysisContext = {
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
    }

    // Include intermediate steps (search results) if available - pass full results for source extraction
    const searchResults = state.collectibleSearchResults || [];
    
    // Also include market_data from valuation if available (Sprint 2)
    const marketData = valuation?.market_data || [];
    
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

**Market Data (Valuation Points):**
${marketData.length > 0 ? JSON.stringify(marketData, null, 2) : 'No structured market data available'}

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
3. If market data points have "condition_label" (e.g. "CGC 9.8", "NM", "chipped"), MENTION how condition affects price (e.g. "A CGC 9.8 copy sold for $X, while raw copies are around $Y").
4. Include the priceSources array with real URLs from the search results above
5. If no price data was found in search results, mention that in the description

Create an engaging description that a collector would appreciate.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: DESCRIBE_COLLECTIBLE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2048,  // Increased from 512 to prevent JSON truncation
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    let parsed;
    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      logger.error('[LangGraph] describe_collectible: Failed to parse response', {
        error: parseError.message,
        raw: response.choices[0].message.content?.substring(0, 2000),  // Show more context for debugging
        fullLength: response.choices[0].message.content?.length
      });
      
      const cat = typeof analysisContext.category === 'string' ? analysisContext.category : (analysisContext.category?.value || 'Item');
      const cond = analysisContext.condition?.label || analysisContext.condition?.value?.label || 'Unknown';
      const valMin = analysisContext.value?.min || '?';
      const valMax = analysisContext.value?.max || '?';
      const valCurr = analysisContext.value?.currency || 'USD';

      // Fall back to template description
      parsed = {
        description: `This ${cat} is in ${cond} condition. Estimated value: $${valMin}-$${valMax} ${valCurr}.`,
        caption: `${cat} - ${cond}`,
        keywords: [cat, cond, 'collectible']
      };
    }

    logger.info('[LangGraph] describe_collectible: Generated rich description', {
      captionLength: parsed.caption?.length,
      descriptionLength: parsed.description?.length,
      keywordCount: parsed.keywords?.length,
      priceSourcesCount: parsed.priceSources?.length || 0
    });

    // Build the enhanced final result with price sources
    const cat = typeof analysisContext.category === 'string' ? analysisContext.category : (analysisContext.category?.value || 'Item');
    const cond = analysisContext.condition?.label || analysisContext.condition?.value?.label || 'Unknown';

    const enhancedFinalResult = {
      caption: parsed.caption || `${cat} - ${cond}`,
      description: parsed.description,
      keywords: parsed.keywords || [cat, 'collectible'],
      classification: state.classification,
      collectibleInsights: {
        identification: identification || null,
        review: review || null,
        category: analysisContext.category,
        condition: analysisContext.condition,
        valuation: {
          lowEstimateUSD: analysisContext.value?.min,
          highEstimateUSD: analysisContext.value?.max,
          currency: analysisContext.value?.currency,
          reasoning: analysisContext.valueReasoning,
          priceSources: parsed.priceSources || []
        },
        // Preserve raw market_data points for DB history + price tracking
        market_data: marketData,
        specifics: analysisContext.specifics,
        confidences: analysisContext.confidences
      }
    };

    return {
      ...state,
      finalResult: enhancedFinalResult
    };
  } catch (err) {
    logger.error('[LangGraph] describe_collectible: Error', err);
    return { ...state, error: err.message || String(err) };
  }
}

module.exports = describe_collectible;
