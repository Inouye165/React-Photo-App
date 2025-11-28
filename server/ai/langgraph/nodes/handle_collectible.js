const { CollectibleOutputSchema, extractCleanData } = require('../../schemas');
const { isCollectiblesAiEnabled } = require('../../../utils/featureFlags');
const { collectibleAgent, collectibleTools } = require('../../langchain/agents');
const { ToolNode } = require('@langchain/langgraph/prebuilt');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const logger = require('../../../logger');

// Maximum iterations for tool-calling loop to prevent infinite loops
const MAX_ITERATIONS = 3;

/**
 * System prompt that enforces the CollectibleOutputSchema JSON structure.
 * This prompt guides the LLM to return data in the exact schema format we expect.
 */
const COLLECTIBLE_CONTRACT_PROMPT = `You are Collectible Curator, a veteran appraiser specializing in accurately identifying and valuing collectibles.

You have access to the google_collectible_search tool to look up current market values and identification information. USE IT to research the item before providing your final answer.

CRITICAL: Your FINAL response MUST be a JSON object that strictly follows this schema:

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
- Use the google_collectible_search tool to research current market values
- If you cannot determine a value with any confidence, use confidence: 0.1
- Always provide reasoning for low confidence scores
- Do NOT fabricate values - if uncertain, reflect it in confidence score
- Return ONLY the JSON object as your final answer, no additional text`;

// Create tool node for executing tools
const toolNode = new ToolNode(collectibleTools);

/**
 * Run the agent loop with tool calling support.
 * This implements a ReAct-style loop where the LLM can call tools and receive results.
 * 
 * @param {Array} messages - Initial messages array
 * @returns {Object} - { output: string, intermediateSteps: Array }
 */
async function runAgentLoop(messages) {
  const intermediateSteps = [];
  let currentMessages = [...messages];
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Call the LLM
    const response = await collectibleAgent.invoke(currentMessages);
    currentMessages.push(response);
    
    // Check if the LLM wants to call tools
    const toolCalls = response.tool_calls;
    
    if (!toolCalls || toolCalls.length === 0) {
      // No tool calls - return the final response
      return {
        output: response.content,
        intermediateSteps
      };
    }
    
    // Execute tool calls
    logger.info('[LangGraph] handle_collectible: Agent calling tools', {
      iteration: i + 1,
      tools: toolCalls.map(tc => tc.name)
    });
    
    // Execute tools via ToolNode
    const toolResults = await toolNode.invoke(currentMessages);
    
    // Add tool results to messages and intermediate steps
    for (const toolResult of toolResults) {
      currentMessages.push(toolResult);
      intermediateSteps.push({
        action: { tool: toolResult.name },
        observation: toolResult.content
      });
    }
  }
  
  // Max iterations reached - get final response without tools
  const finalResponse = await collectibleAgent.invoke(currentMessages);
  return {
    output: finalResponse.content,
    intermediateSteps
  };
}

/**
 * Handle collectible analysis node for LangGraph pipeline.
 * 
 * This node processes images classified as collectibles, using AI to:
 * 1. Identify the collectible category
 * 2. Assess physical condition
 * 3. Estimate market value (using Google Search tool)
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

    // Build the messages for the agent with multimodal content
    // Use content array format for image support in LangChain
    const userContent = [
      {
        type: 'text',
        text: `Analyze this collectible image and return the structured JSON response.

Available metadata keys: ${Object.keys(state.metadata || {}).join(', ')}
Classification: ${state.classification || 'collectible'}

First, use the google_collectible_search tool to research current market values for this type of item.
Then provide your final answer as a VALID JSON object matching the Schema. Do NOT include any markdown formatting or code blocks.`
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:${state.imageMime};base64,${state.imageBase64}`,
          detail: 'high'
        }
      }
    ];

    const messages = [
      new SystemMessage(COLLECTIBLE_CONTRACT_PROMPT),
      new HumanMessage({ content: userContent })
    ];

    logger.info('[LangGraph] handle_collectible: Invoking agent with tool support');
    
    // Run the agent loop with tool support
    const response = await runAgentLoop(messages);

    // Log intermediate steps for debugging
    if (response.intermediateSteps && response.intermediateSteps.length > 0) {
      logger.info('[LangGraph] handle_collectible: Agent used tools', {
        stepCount: response.intermediateSteps.length,
        tools: response.intermediateSteps.map(step => step.action?.tool || 'unknown')
      });
    }

    // Parse the output
    let rawParsed;
    try {
      // Clean the output - remove any markdown code blocks if present
      let cleanOutput = response.output;
      if (cleanOutput.startsWith('```json')) {
        cleanOutput = cleanOutput.slice(7);
      } else if (cleanOutput.startsWith('```')) {
        cleanOutput = cleanOutput.slice(3);
      }
      if (cleanOutput.endsWith('```')) {
        cleanOutput = cleanOutput.slice(0, -3);
      }
      cleanOutput = cleanOutput.trim();
      
      rawParsed = JSON.parse(cleanOutput);
    } catch (parseError) {
      logger.error('[LangGraph] handle_collectible: Failed to parse JSON response', {
        error: parseError.message,
        raw_response: response.output?.substring(0, 500)
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