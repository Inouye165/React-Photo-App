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
const { reverseGeocode, nearbyPlaces } = require('../poi/googlePlaces');

// --- Debug helpers ---
function accumulateDebugUsage(debugUsage = [], entry = {}) {
  const next = Array.isArray(debugUsage) ? [...debugUsage] : [];
  next.push(entry);
  return next;
}

function extractUsageFromResponse(response) {
  try {
    const usage = response?.usage || null;
    const model = response?.model || response?.choices?.[0]?.model || null;
    return { usage, model };
  } catch {
    return { usage: null, model: null };
  }
}


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
      `poiAnalysis: ${JSON.stringify(state.poiAnalysis)}\n` +
      `sceneDecision: ${JSON.stringify(state.sceneDecision)}\n` +
      `Note: If 'sceneDecision' is present and its confidence is "high" or "medium", prefer using sceneDecision.chosenLabel as the place name or location mention in caption and description. If sceneDecision is absent or confidence is low, do not invent specific POI names; instead use descriptive alternatives.\n` +
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

// --- Node: infer_poi (new) ---
async function infer_poi(state) {
  let debugUsage = state.debugUsage;
  try {
    if (!state.gpsString) {
      return { ...state, poiAnalysis: null, debugUsage };
    }
    const [latStr, lonStr] = String(state.gpsString || '').split(',').map((s) => s && s.trim());
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return { ...state, poiAnalysis: null, debugUsage };
    }

    const addrRes = await reverseGeocode(lat, lon);
    const nearby = await nearbyPlaces(lat, lon, 500);

    const priority = ['attraction', 'park', 'trail', 'hotel', 'restaurant', 'store'];
    let best = null;
    for (const p of priority) {
      const found = nearby.find((x) => x.category === p);
      if (found) { best = found; break; }
    }
    if (!best && nearby.length) best = nearby[0];

    const poiAnalysis = {
      address: addrRes?.address || null,
      bestMatchPOI: best || null,
      bestMatchCategory: best?.category || null,
      poiConfidence: best?.confidence || 'low',
      nearbyPOIs: nearby,
    };

    debugUsage = accumulateDebugUsage(debugUsage, {
      step: 'infer_poi',
      model: null,
      usage: null,
      durationMs: 0,
      notes: 'Inferred POI from Google Places',
      request: { systemPrompt: null, userPrompt: `Reverse geocode + nearby search at ${lat},${lon}` },
      response: poiAnalysis,
      prompt: `Reverse geocode + nearby search at ${lat},${lon}`,
    });

    return { ...state, poiAnalysis, debugUsage };
  } catch (err) {
    logger.warn('[LangGraph] infer_poi failed', err && err.message ? err.message : err);
    return { ...state, poiAnalysis: null, debugUsage };
  }
}

// --- Node: decide_scene_label (new) ---
async function decide_scene_label(state) {
  let debugUsage = state.debugUsage;
  try {
    const poi = state.poiAnalysis && state.poiAnalysis.bestMatchPOI ? state.poiAnalysis.bestMatchPOI : null;

    const systemPrompt = 'You are a short-image-tagger assistant. Respond with JSON object {"tags": [..]}.';
    const userPrompt = 'Provide a short list of descriptive tags (single words) about the image content, like ["geyser","steam","hotel","trail","flower","closeup"]. Return JSON only.';

    const userContent = [
      { type: 'text', text: userPrompt },
      { type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'low' } },
    ];

    const configuredModel = state.modelOverrides?.defaultModel || 'gpt-4o';
    let tags = [];
    try {
      const response = await openai.chat.completions.create({
        model: configuredModel,
        messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userContent } ],
        max_tokens: 128,
        response_format: { type: 'json_object' },
      });

      const raw = response?.choices?.[0]?.message?.content || '{}';
      try {
        const parsed = JSON.parse(raw);
        tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).toLowerCase()) : [];
      } catch {
        tags = [];
      }
      const durationMs = 0;
      const { usage, model } = extractUsageFromResponse(response);
      debugUsage = accumulateDebugUsage(debugUsage, {
        step: 'decide_scene_label_tagging',
        model: model || configuredModel,
        usage,
        durationMs,
        notes: 'Image tag extraction',
        request: { systemPrompt, userPrompt },
        response: raw,
        prompt: userPrompt,
      });
    } catch {
      tags = [];
    }

    const chosenLabelFallback = (state.poiAnalysis && state.poiAnalysis.address) || null;
    let chosenLabel = null;
    let rationale = '';
    let confidence = 'low';

    const nameMatchesOldFaithful = poi && /Old Faithful/i.test(poi.name || '');
    const hasGeyserTag = tags.some((t) => /geyser|steam|plume|vent|water/.test(t));
    if (nameMatchesOldFaithful && hasGeyserTag && poi.distanceMeters <= 120) {
      chosenLabel = poi.name;
      rationale = 'POI name matched and image tags indicate geyser; close distance';
      confidence = 'high';
    } else if (poi && tags.some((t) => /hotel|lodge|inn|building|roof|timber/.test(t)) && poi.category === 'hotel' && poi.distanceMeters <= 200) {
      chosenLabel = poi.name;
      rationale = 'Tags indicate lodging and nearby hotel matches';
      confidence = 'medium';
    } else if (nameMatchesOldFaithful && tags.some((t) => /flower|plant|macro|closeup/.test(t)) && poi.distanceMeters <= 300) {
      chosenLabel = `${poi.name} area, Yellowstone National Park`;
      rationale = 'Macro/flower shot near Old Faithful';
      confidence = 'medium';
    } else if (tags.some((t) => /trail|boardwalk|path|walkway/.test(t)) && poi && ['trail','attraction','park'].includes(poi.category)) {
      chosenLabel = poi.name || chosenLabelFallback;
      rationale = 'Trail/boardwalk tags and nearby POI';
      confidence = 'medium';
    } else if (poi) {
      chosenLabel = poi.name || chosenLabelFallback;
      rationale = 'Falling back to nearest POI name or address';
      confidence = poi.confidence || 'low';
    } else if (chosenLabelFallback) {
      chosenLabel = chosenLabelFallback;
      rationale = 'No POI; using reverse geocode address';
      confidence = 'low';
    }

    const sceneDecision = chosenLabel ? { chosenLabel, rationale, confidence } : null;

    debugUsage = accumulateDebugUsage(debugUsage, {
      step: 'decide_scene_label',
      model: null,
      usage: null,
      durationMs: 0,
      notes: 'Scene label decision based on POI and tags',
      request: { systemPrompt: null, userPrompt: `Tags: ${tags.join(',')}` },
      response: sceneDecision,
      prompt: `Tags: ${tags.join(',')}`,
    });

    return { ...state, sceneDecision, debugUsage };
  } catch (err) {
    logger.warn('[LangGraph] decide_scene_label failed', err && err.message ? err.message : err);
    return { ...state, sceneDecision: null, debugUsage };
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

  const classification = String(state.classification || '').toLowerCase().trim();
  logger.info(`[LangGraph] Router: Routing based on "${classification}"`);

  if (classification === 'collectables') {
    return 'handle_collectible';
  }

  if (classification === 'scenery' || classification.includes('scenery')) {
    return 'infer_poi';
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
workflow.addNode('infer_poi', infer_poi);
workflow.addNode('decide_scene_label', decide_scene_label);

// 2. Set the entry point
workflow.setEntryPoint('classify_image');

// 3. Add the conditional edges (the router)
workflow.addConditionalEdges(
  'classify_image', // The node to branch from
  route_classification, // The function that decides where to go
  {
    // A map of the function's return values to the next node
    generate_metadata: 'generate_metadata',
    infer_poi: 'infer_poi',
    handle_collectible: 'handle_collectible',
    __end__: END, // Allow the router to end the graph if it returns END
  }
);

// 4. Add the final edges
workflow.addEdge('generate_metadata', END);
workflow.addEdge('handle_collectible', END);
workflow.addEdge('infer_poi', 'decide_scene_label');
workflow.addEdge('decide_scene_label', 'generate_metadata');

// 5. Compile the app
const app = workflow.compile();
module.exports = { app };