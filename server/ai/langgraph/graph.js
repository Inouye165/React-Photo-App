// LangGraph-based implementation
const { StateGraph, END } = require('@langchain/langgraph');
// We need HumanMessage AND SystemMessage
const {
  HumanMessage,
  SystemMessage,
} = require('@langchain/core/messages');
const { openai } = require('../openaiClient');
const logger = require('../../logger');
const { AppState } = require('./state');

// --- Import the specialist agent & prompt from your old files ---
const {
  collectibleAgent,
  COLLECTIBLE_SYSTEM_PROMPT,
} = require('../langchain/agents');

// --- Node 1: classify_image (This node is correct) ---
async function classify_image(state) {
  try {
    logger.info('[LangGraph] classify_image node invoked');
    const prompt =
      'Classify this image as one of the following categories: scenery, food, receipt, collectables, health data, or other. ' +
      'Return ONLY a JSON object: {"classification": "..."}.';

    // Build the plain JS content array directly for the raw OpenAI client
    const userContent = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${state.imageMime};base64,${state.imageBase64}`,
          detail: 'low',
        },
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for image classification.',
        },
        { role: 'user', content: userContent }, // <-- Use the plain array
      ],
      max_tokens: 64,
      response_format: { type: 'json_object' },
    });

    let parsed;
    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch (e) {
      logger.error(
        '[LangGraph] classify_image: Failed to parse model response',
        e,
        response.choices[0].message.content
      );
      return {
        ...state,
        error: 'Failed to parse classification response: ' + e.message,
      };
    }
    logger.info(
      '[LangGraph] classify_image: Model classified as',
      parsed.classification
    );
    return { ...state, classification: parsed.classification, error: null };
  } catch (err) {
    logger.error('[LangGraph] classify_image: Error', err);
    return { ...state, error: err.message || String(err) };
  }
}

// --- Node 2: generate_metadata (This node is correct) ---
async function generate_metadata(state) {
  try {
    logger.info('[LangGraph] generate_metadata node invoked (default/scenery)');
    const prompt =
      `You are a photo archivist. Given the image and the following context, generate a JSON object with three fields:\n` +
      `caption: A short, one-sentence title for the photo.\n` +
      `description: A detailed, multi-sentence paragraph describing the visual contents.\n` +
      `keywords: A comma-separated string that begins with the classification provided (${state.classification}) followed by 4-9 descriptive keywords. After the descriptive keywords, append explicit metadata keywords for capture date, capture time, facing direction, GPS coordinates, and altitude. Use the formats date:YYYY-MM-DD, time:HH:MM:SSZ, direction:<cardinal or degrees>, gps:<latitude,longitude>, altitude:<value>m. When a value is missing, use date:unknown, time:unknown, direction:unknown, gps:unknown, or altitude:unknown.\n` +
      `\nContext:\n` +
      `classification: ${state.classification}\n` +
      `metadata: ${JSON.stringify(state.metadata)}\n` +
      `gps: ${state.gpsString}\n` +
      `device: ${state.device}\n` +
      `\nReturn ONLY a JSON object: {"caption": "...", "description": "...", "keywords": "..."}`;

    // Build the plain JS content array directly for the raw OpenAI client
    const userContent = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${state.imageMime};base64,${state.imageBase64}`,
          detail: 'high',
        },
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for photo metadata extraction.',
        },
        { role: 'user', content: userContent }, // <-- Use the plain array
      ],
      max_tokens: 512,
      response_format: { type: 'json_object' },
    });

    let parsed;
    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch (e) {
      // --- ENHANCED LOGGING ---
      logger.error(
        '[LangGraph] generate_metadata: FAILED TO PARSE AGENT RESPONSE. This often means the agent returned a simple text fallback instead of JSON.',
        {
          error: e.message,
          raw_response: response.choices[0].message.content,
        }
      );
      // --- END OF ENHANCEMENT ---
      return {
        ...state,
        error: 'Failed to parse metadata response: ' + e.message,
      };
    }
    logger.info('[LangGraph] generate_metadata: Model returned metadata');
    // Also store the classification in the final result
    parsed.classification = state.classification;
    return { ...state, finalResult: parsed, error: null };
  } catch (err) {
    logger.error('[LangGraph] generate_metadata: Error', err);
    return { ...state, error: err.message || String(err) };
  }
}

// --- Node 3: handle_collectible (FIXED) ---
async function handle_collectible(state) {
  try {
    logger.info('[LangGraph] handle_collectible node invoked (specialist)');

    // We build a standard array of messages, including the system prompt
    const messages = [
      new SystemMessage(COLLECTIBLE_SYSTEM_PROMPT),
      new HumanMessage({
        content: [
          {
            type: 'text',
            text: `Analyze this collectible image. Available metadata: ${JSON.stringify(
              state.metadata
            )}`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${state.imageMime};base64,${state.imageBase64}`,
              detail: 'high',
            },
          },
        ],
      }),
    ];

    // Invoke the specialist LANGCHAIN agent
    const response = await collectibleAgent.invoke(messages);

    let parsed;
    try {
      parsed = JSON.parse(response.content);
    } catch (e) {
      // --- ENHANCED LOGGING ---
      logger.error(
        '[LangGraph] handle_collectible: FAILED TO PARSE AGENT RESPONSE. This often means the agent failed to call a tool (e.g., missing API key) and returned a simple text fallback.',
        {
          error: e.message,
          raw_response: response.content,
        }
      );
      // --- END OF ENHANCEMENT ---
      return {
        ...state,
        error: 'Failed to parse collectible agent response: ' + e.message,
      };
    }
    logger.info('[LangGraph] handle_collectible: Specialist agent returned');
    // Also store the classification in the final result
    parsed.classification = state.classification;
    return { ...state, finalResult: parsed, error: null };
  } catch (err) {
    logger.error('[LangGraph] handle_collectible: Error', err);
    return { ...state, error: err.message || String(err) };
  }
}

// --- Router: Decides which node to call after classification ---
function route_classification(state) {
  if (state.error) {
    logger.error(
      '[LangGraph] Router: Error detected, ending graph.',
      state.error
    );
    return END;
  }

  const classification = state.classification?.toLowerCase();
  logger.info(`[LangGraph] Router: Routing based on "${classification}"`);

  if (classification === 'collectables') {
    return 'handle_collectible';
  }

  // All other classifications go to the default metadata generator
  return 'generate_metadata';
}

// --- Build the LangGraph workflow ---
const workflow = new StateGraph({
  // Use the Zod schema from your state.js for validation
  channels: AppState.shape, // <-- This fix was correct
});

// 1. Add all the nodes
workflow.addNode('classify_image', classify_image);
workflow.addNode('generate_metadata', generate_metadata);
workflow.addNode('handle_collectible', handle_collectible);

// 2. Set the entry point
workflow.setEntryPoint('classify_image');

// 3. Add the conditional edges (the router)
workflow.addConditionalEdges(
  'classify_image', // The node to branch from
  route_classification, // The function that decides where to go
  {
    // A map of the function's return values to the next node
    generate_metadata: 'generate_metadata',
    handle_collectible: 'handle_collectible',
    __end__: END, // Allow the router to end the graph if it returns END
  }
);

// 4. Add the final edges
workflow.addEdge('generate_metadata', END);
workflow.addEdge('handle_collectible', END);

// 5. Compile the app
const app = workflow.compile();
module.exports = { app };