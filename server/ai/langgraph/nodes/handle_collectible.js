const { CollectibleOutputSchema, extractCleanData } = require('../../schemas');
const { isCollectiblesAiEnabled } = require('../../../utils/featureFlags');
const { openai } = require('../../openaiClient');
const logger = require('../../../logger');

// Use the same model config as the existing collectibleAgent
const COLLECTIBLE_MODEL = process.env.AI_COLLECTIBLE_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * System prompt that enforces the CollectibleOutputSchema JSON structure.
 * This prompt guides the LLM to return data in the exact schema format we expect.
 */
const COLLECTIBLE_CONTRACT_PROMPT = `You are Collectible Curator, a veteran appraiser specializing in accurately identifying and valuing collectibles.

CRITICAL: You MUST respond with a JSON object that strictly follows this schema:

{
  "category": {
    "value": "<string: collectible category, e.g., 'Pyrex', 'Comic Book', 'Trading Card'>",
    "confidence": <number 0-1>,
    "reasoning": "<optional string explaining confidence>"
  },
  "condition": {
    "value": {
      "rank": <integer 1-5>,
      "label": "<one of: 'Poor', 'Fair', 'Good', 'Very Good', 'Mint/Near Mint'>"
    },
    "confidence": <number 0-1>,
    "reasoning": "<optional string explaining condition assessment>"
  },
  "value": {
    "value": {
      "min": <number: minimum estimated value>,
      "max": <number: maximum estimated value>,
      "currency": "USD"
    },
    "confidence": <number 0-1>,
    "reasoning": "<optional string explaining valuation sources>"
  },
  "specifics": {
    "<attribute_name>": {
      "value": <any: the attribute value>,
      "confidence": <number 0-1>,
      "reasoning": "<optional string>"
    }
  }
}

CONDITION RANK GUIDE:
- 1 (Poor): Significant damage, missing parts, heavy wear
- 2 (Fair): Noticeable wear, minor damage, still functional/displayable
- 3 (Good): Light wear, no major flaws, typical used condition
- 4 (Very Good): Minimal wear, excellent preserved condition
- 5 (Mint/Near Mint): Perfect or near-perfect, like new

CONFIDENCE GUIDE:
- 0.9+: High confidence - clear identification, reliable sources
- 0.8-0.89: Good confidence - likely correct but may need review
- 0.5-0.79: Low confidence - uncertain, treat as suggestion
- <0.5: Very low confidence - speculative only

For "specifics", include category-relevant attributes such as:
- Pyrex: pattern, color, year_range, size
- Comics: publisher, issue_number, year, artist
- Trading Cards: set, card_number, player, year
- Coins: denomination, mint_mark, year, metal

IMPORTANT:
- If you cannot determine a value with any confidence, use confidence: 0.1
- Always provide reasoning for low confidence scores
- Do NOT fabricate values - if uncertain, reflect it in confidence score
- Return ONLY the JSON object, no additional text`;

/**
 * Handle collectible analysis node for LangGraph pipeline.
 * 
 * This node processes images classified as collectibles, using AI to:
 * 1. Identify the collectible category
 * 2. Assess physical condition
 * 3. Estimate market value
 * 4. Extract category-specific attributes
 * 
 * @param {Object} state - LangGraph state containing image data
 * @param {string} state.imageBase64 - Base64 encoded image
 * @param {string} state.imageMime - MIME type of the image
 * @param {Object} state.metadata - EXIF and other metadata
 * @param {string} state.classification - Image classification result
 * @returns {Object} Updated state with collectibleData or error
 */
async function handle_collectible(state) {
  try {
    logger.info('[LangGraph] handle_collectible node invoked');

    // Check feature flag - return early if disabled but still provide a finalResult
    // so the pipeline doesn't fail
    if (!isCollectiblesAiEnabled()) {
      logger.info('[LangGraph] handle_collectible: Collectibles AI disabled, generating fallback result');
      return {
        ...state,
        finalResult: {
          caption: 'Collectible item',
          description: 'This appears to be a collectible item. Enable ENABLE_COLLECTIBLES_AI for detailed analysis.',
          keywords: ['collectible'],
          classification: state.classification || 'collectables'
        },
        collectibleResult: {
          collectibleData: null,
          status: 'skipped',
          reason: 'ENABLE_COLLECTIBLES_AI is false'
        }
      };
    }

    // Build the user content with image for direct OpenAI API call
    const userContent = [
      {
        type: 'text',
        text: `Analyze this collectible image and return the structured JSON response.
            
Available metadata keys: ${Object.keys(state.metadata || {}).join(', ')}
Classification: ${state.classification || 'collectible'}`,
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${state.imageMime};base64,${state.imageBase64}`,
          detail: 'high',
        },
      },
    ];

    logger.info('[LangGraph] handle_collectible: Invoking AI agent');
    
    // Use direct OpenAI client with response_format for reliable JSON output
    const response = await openai.chat.completions.create({
      model: COLLECTIBLE_MODEL,
      messages: [
        { role: 'system', content: COLLECTIBLE_CONTRACT_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 1400,
      temperature: 0.25,
      response_format: { type: 'json_object' },
    });

    // Parse the raw response from the OpenAI API
    let rawParsed;
    try {
      rawParsed = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      logger.error('[LangGraph] handle_collectible: Failed to parse JSON response', {
        error: parseError.message,
        raw_response: response.choices[0].message.content?.substring(0, 500)
      });
      return {
        ...state,
        collectibleResult: {
          collectibleData: null,
          status: 'failed',
          error: `JSON parse error: ${parseError.message}`
        }
      };
    }

    // CRITICAL: Validate against CollectibleOutputSchema
    const validationResult = CollectibleOutputSchema.safeParse(rawParsed);

    if (!validationResult.success) {
      logger.warn('[LangGraph] handle_collectible: Schema validation failed', {
        errors: validationResult.error.errors,
        raw_response: JSON.stringify(rawParsed).substring(0, 500)
      });
      return {
        ...state,
        collectibleResult: {
          collectibleData: null,
          status: 'failed',
          error: `Schema validation failed: ${validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')}`
        }
      };
    }

    // Extract clean data for eventual DB storage
    const fullAnalysis = validationResult.data;
    const cleanData = extractCleanData(fullAnalysis);

    logger.info('[LangGraph] handle_collectible: Successfully validated response', {
      category: cleanData.category,
      conditionRank: cleanData.condition.rank,
      valueRange: `${cleanData.value.min}-${cleanData.value.max} ${cleanData.value.currency}`,
      specificsCount: Object.keys(cleanData.specifics).length
    });

    // Preserve backward compatibility with finalResult
    const legacyResult = {
      caption: `${cleanData.category} - ${cleanData.condition.label}`,
      description: `Estimated value: $${cleanData.value.min}-$${cleanData.value.max}`,
      keywords: [cleanData.category, cleanData.condition.label],
      collectibleInsights: {
        category: cleanData.category,
        condition: cleanData.condition,
        valuation: {
          lowEstimateUSD: cleanData.value.min,
          highEstimateUSD: cleanData.value.max
        },
        specifics: cleanData.specifics
      },
      classification: state.classification
    };

    return {
      ...state,
      finalResult: legacyResult,
      collectibleResult: {
        collectibleData: {
          cleanData,
          fullAnalysis
        },
        status: 'success'
      },
      error: null
    };
  } catch (err) {
    logger.error('[LangGraph] handle_collectible: Unexpected error', {
      error: err.message,
      stack: err.stack
    });
    return {
      ...state,
      collectibleResult: {
        collectibleData: null,
        status: 'failed',
        error: err.message || String(err)
      },
      error: err.message || String(err)
    };
  }
}

module.exports = handle_collectible;