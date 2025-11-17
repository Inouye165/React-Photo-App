// LangGraph-based implementation
// C:\Users\Ron\React-Photo-App\server\ai\langgraph\graph.js
const { StateGraph, END } = require('@langchain/langgraph');
// We need HumanMessage AND SystemMessage
const {
  HumanMessage,
  SystemMessage,
} = require('@langchain/core/messages');
const { openai } = require('../openaiClient');
const logger = require('../../logger');
const { AppState } = require('./state');
const allowDevDebug = process.env.ALLOW_DEV_DEBUG === 'true';
const FOOD_POI_MATCH_SCORE_THRESHOLD = parseInt(process.env.FOOD_POI_MATCH_SCORE_THRESHOLD || '2', 10);
// If we don't find a good match within the tight radius, optionally try a lower-confidence
// search in a broader radius for restaurants. Default fallback radius: 30.48 m (~100 ft)
const FOOD_POI_FALLBACK_RADIUS = parseFloat(process.env.FOOD_POI_FALLBACK_RADIUS || '30.48');

// --- Import the specialist agent & prompt from your old files ---
const {
  collectibleAgent,
  COLLECTIBLE_SYSTEM_PROMPT,
} = require('../langchain/agents');
const { reverseGeocode, nearbyPlaces } = require('../poi/googlePlaces');
const { nearbyFoodPlaces } = require('../poi/foodPlaces');
const { fetchDishNutrition } = require('../food/nutritionSearch');
const { nearbyTrailsFromOSM } = require('../poi/osmTrails');

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

function needPoi(state) {
  if (!state) return false;
  return Boolean(state.poiAnalysis?.gpsString);
}

function parseGpsString(gpsString) {
  if (!gpsString) return null;
  const [latStr, lonStr] = String(gpsString)
    .split(',')
    .map((s) => (s || '').trim())
    .filter(Boolean);
  if (!latStr || !lonStr) return null;
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function dmsToDecimal(values, ref) {
  if (!Array.isArray(values) || values.length < 3) return null;
  const [deg, min, sec] = values.map(parseNumber);
  if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  let decimal = deg + min / 60 + sec / 3600;
  if (typeof ref === 'string' && ['S', 'W'].includes(ref.toUpperCase())) {
    decimal *= -1;
  }
  return decimal;
}

function resolveGpsFromMetadata(meta = {}) {
  const candidatePairs = [
    { lat: meta.latitude, lon: meta.longitude },
    { lat: meta.lat, lon: meta.lon },
    { lat: meta.Latitude, lon: meta.Longitude },
    { lat: meta?.location?.lat, lon: meta?.location?.lon },
    { lat: meta?.GPS?.latitude, lon: meta?.GPS?.longitude },
  ];
  for (const pair of candidatePairs) {
    if (pair && pair.lat != null && pair.lon != null) {
      const lat = parseNumber(pair.lat);
      const lon = parseNumber(pair.lon);
      if (lat != null && lon != null) return { lat, lon };
    }
  }

  if (Array.isArray(meta.GPSLatitude) && Array.isArray(meta.GPSLongitude)) {
    const lat = dmsToDecimal(meta.GPSLatitude, meta.GPSLatitudeRef);
    const lon = dmsToDecimal(meta.GPSLongitude, meta.GPSLongitudeRef);
    if (lat != null && lon != null) return { lat, lon };
  }
  return null;
}

function parseGpsCoordinates(state) {
  return parseGpsString(state.gpsString) || resolveGpsFromMetadata(state.metadata || {});
}

function extractHeading(meta = {}) {
  const candidates = [
    meta.heading,
    meta.Heading,
    meta.direction,
    meta.Direction,
    meta.facingDirection,
    meta.compassHeading,
    meta?.GPSImgDirection,
    meta?.GPSDirection,
    meta?.GPSDestBearing,
    meta?.GPS?.GPSImgDirection,
    meta?.GPSInfo?.GPSImgDirection,
  ];
  for (const value of candidates) {
    const num = parseNumber(value);
    if (num != null) return num;
  }
  return null;
}

function extractAltitude(meta = {}) {
  const candidates = [
    meta.altitude,
    meta.Altitude,
    meta.GPSAltitude,
    meta?.GPS?.GPSAltitude,
    meta?.GPSInfo?.GPSAltitude,
  ];
  for (const value of candidates) {
    const num = parseNumber(value);
    if (num != null) return num;
  }
  return null;
}

function extractTimestamp(meta = {}) {
  const gpsDate = typeof meta.GPSDateStamp === 'string' ? meta.GPSDateStamp.trim() : null;
  let gpsTime = null;
  if (Array.isArray(meta.GPSTimeStamp)) {
    gpsTime = meta.GPSTimeStamp.map((part) => String(part).padStart(2, '0')).join(':');
  } else if (typeof meta.GPSTimeStamp === 'string') {
    gpsTime = meta.GPSTimeStamp.trim();
  }
  if (gpsDate && gpsTime) {
    return `${gpsDate} ${gpsTime}`;
  }

  const candidates = [
    meta.captureTimestamp,
    meta.captureTime,
    meta.DateTimeOriginal,
    meta.CreateDate,
    meta.DateCreated,
    meta.ModifyDate,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function headingToCardinal(degrees) {
  if (degrees == null || !Number.isFinite(degrees)) return null;
  const normalized = ((degrees % 360) + 360) % 360;
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(normalized / 22.5) % directions.length;
  return directions[index];
}

function buildLocationIntelDefaults(overrides = {}) {
  return {
    city: 'unknown',
    region: 'unknown',
    nearest_landmark: 'unknown',
    nearest_park: 'unknown',
    nearest_trail: 'unknown',
    description_addendum: 'No additional location insights available.',
    ...overrides,
  };
}

function sanitizeIntelField(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function postProcessLocationIntel(intel) {
  if (!intel || typeof intel !== 'object') return intel;
  const result = { ...intel };

  const parkUnknown =
    !sanitizeIntelField(result.nearest_park) ||
    String(result.nearest_park).trim().toLowerCase() === 'unknown';

  const landmark = sanitizeIntelField(result.nearest_landmark);

  if (parkUnknown && typeof landmark === 'string') {
    const looksLikePark =
      /\b(open space|regional park|state park|city park|preserve|recreation area|park)\b/i.test(
        landmark
      );

    if (looksLikePark) {
      result.nearest_park = landmark;
    }
  }

  return result;
}

function selectBestNearby(nearby = [], intel = {}) {
  if (!Array.isArray(nearby)) return null;
  const priority = ['landmark', 'attraction', 'park', 'trail', 'mountain', 'river'];
  for (const category of priority) {
    const found = nearby.find((place) => (place?.category || '').toLowerCase() === category);
    if (found) return found;
  }
  if (sanitizeIntelField(intel.nearest_landmark)) {
    return {
      name: intel.nearest_landmark,
      category: 'landmark',
      distanceMeters: null,
    };
  }
  return null;
}

function enrichMetadataWithPoi(parsed, poiAnalysis) {
  if (!parsed || !poiAnalysis) return parsed;
  const intel = poiAnalysis.locationIntel || poiAnalysis;
  if (!intel) return parsed;

  const fields = [
    { key: 'city', label: 'City' },
    { key: 'region', label: 'Region' },
    { key: 'nearest_park', label: 'Nearest park' },
    { key: 'nearest_trail', label: 'Nearest trail' },
    { key: 'nearest_landmark', label: 'Nearest landmark' },
    { key: 'description_addendum', label: 'Notes' },
  ];

  const descriptionExtras = [];
  const keywordExtras = [];

  for (const field of fields) {
    const value = sanitizeIntelField(intel[field.key]);
    if (value) {
      descriptionExtras.push(`${field.label}: ${value}`);
      keywordExtras.push(value);
    }
  }

  if (descriptionExtras.length) {
    const detail = `Location Intelligence: ${descriptionExtras.join(' | ')}`;
    parsed.description = parsed.description
      ? `${parsed.description}\n\n${detail}`
      : detail;
  }

  if (keywordExtras.length) {
    parsed.keywords = parsed.keywords
      ? `${parsed.keywords}, ${keywordExtras.join(', ')}`
      : keywordExtras.join(', ');
  }

  return parsed;
}

function metadataPayloadWithDirection(state) {
  const base = state.metadata || {};
  const heading = extractHeading(base);
  const payload = {
    ...base,
    directionDegrees: heading,
    directionCardinal: headingToCardinal(heading),
    altitudeMeters: extractAltitude(base),
  };
  return payload;
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
    const metadataForPrompt = metadataPayloadWithDirection(state);
    const prompt =
      `You are a photo archivist. Given the image and the following context, generate a JSON object with three fields:\n` +
      `caption: A short, one-sentence title for the photo.\n` +
      `description: A detailed, multi-sentence paragraph describing the visual contents.\n` +
      `keywords: A comma-separated string that begins with the classification provided (${state.classification}) followed by 4-9 descriptive keywords. After the descriptive keywords, append explicit metadata keywords for capture date, capture time, facing direction, GPS coordinates, and altitude. Use the formats date:YYYY-MM-DD, time:HH:MM:SSZ, direction:<cardinal or degrees>, gps:<latitude,longitude>, altitude:<value>m. When a value is missing, use date:unknown, time:unknown, direction:unknown, gps:unknown, or altitude:unknown.\n` +
      `\nContext:\n` +
      `classification: ${state.classification}\n` +
      `metadata: ${JSON.stringify(metadataForPrompt)}\n` +
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
    parsed = enrichMetadataWithPoi(parsed, state.poiAnalysis);
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

// --- Node: location_intelligence_agent (always-on POI) ---
async function location_intelligence_agent(state) {
  let debugUsage = state.debugUsage;
  const metadata = state.metadata || {};
  const coordinates = parseGpsCoordinates(state);
  const gpsString = coordinates
    ? `${coordinates.lat.toFixed(6)},${coordinates.lon.toFixed(6)}`
    : state.gpsString || null;
  const heading = extractHeading(metadata);
  const altitude = extractAltitude(metadata);
  const timestamp = extractTimestamp(metadata);
  const headingCardinal = headingToCardinal(heading);

  if (!coordinates) {
    logger.info('[infer_poi] Skipped: no GPS available');
    return { ...state, poiAnalysis: null, debugUsage };
  }

  logger.info(
    `[infer_poi] GPS found: ${coordinates.lat.toFixed(4)},${coordinates.lon.toFixed(4)} — querying Google Places...`
  );

  let reverseResult = null;
  let nearby = [];
  let osmTrails = [];
  if (coordinates) {
    try {
      reverseResult = await reverseGeocode(coordinates.lat, coordinates.lon);
    } catch (err) {
      logger.warn('[LangGraph] location_intelligence_agent reverse geocode failed', err?.message || err);
    }
    try {
      nearby = await nearbyPlaces(coordinates.lat, coordinates.lon, 800);
    } catch (err) {
      logger.warn('[LangGraph] location_intelligence_agent nearbyPlaces failed', err?.message || err);
    }
    try {
      osmTrails = await nearbyTrailsFromOSM(coordinates.lat, coordinates.lon, 2000);
    } catch (err) {
      logger.warn('[location_intel] OSM trails lookup failed', err?.message || err);
    }
  }

  const structuredContext = {
    gps_string: gpsString,
    coordinates,
    heading_degrees: heading,
    heading_cardinal: headingCardinal,
    altitude_meters: altitude,
    timestamp_utc: timestamp,
    device: state.device || metadata.CameraModel || metadata.Model || null,
    reverse_geocode: reverseResult,
    nearby_places: nearby,
    nearby_trails_osm: osmTrails,
    metadata_snapshot: {
      captureDate: metadata.DateTimeOriginal || metadata.CreateDate || metadata.ModifyDate || null,
      elevation: altitude,
      heading,
    },
  };

  const locationModel = state.modelOverrides?.locationModel || 'gpt-4o-mini';
  const systemPrompt =
    'You are the Expert Location Detective. Using ONLY the structured GPS metadata provided, infer the most likely city, region, nearby landmark, park, and trail. ' +
    'Input fields include reverse-geocoded address details, Google Places nearby POIs (nearby_places), and OSM trail/canal/aqueduct features (nearby_trails_osm). ' +
    'Always respond with a JSON object containing exactly the keys: city, region, nearest_landmark, nearest_park, nearest_trail, description_addendum. ' +
    'Use descriptive, human-readable names when possible. When information is missing, use the string "unknown". description_addendum should be 1 sentence highlighting unique geographic insight. ' +
    'Do not hallucinate or invent locations. Only use the structured metadata, images, and listed nearby POIs/trails to infer locations. If the data is insufficient, return "unknown" for that field rather than fabricating a name. ' +
    'If nearest_park would otherwise be "unknown" but nearest_landmark clearly refers to an open space, preserve, or park (e.g., contains "Open Space", "Regional Park", "State Park", "City Park", "Preserve", or "Recreation Area"), reuse that name for nearest_park. ' +
    'When choosing nearest_trail, FIRST look at nearby_trails_osm and prefer a named trail, canal path, or aqueduct walkway there. If nearby_trails_osm is empty or lacks a suitable candidate, fall back to nearby_places entries whose names contain words like "Trail", "Trailhead", "Canal", "Aqueduct", "Greenway", "Walkway", or "Path".';

  const userPrompt =
    'Structured metadata for analysis:\n' +
    `${JSON.stringify(structuredContext, null, 2)}\n` +
    'Return ONLY valid JSON with the required keys. Do not include Markdown or explanations.';

  let locationIntel = buildLocationIntelDefaults();
  try {
    const response = await openai.chat.completions.create({
      model: locationModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });
    const raw = response?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn('[LangGraph] location_intelligence_agent JSON parse fallback', err?.message || err);
      parsed = {};
    }
    locationIntel = buildLocationIntelDefaults({
      city: sanitizeIntelField(parsed.city) || 'unknown',
      region: sanitizeIntelField(parsed.region) || 'unknown',
      nearest_landmark: sanitizeIntelField(parsed.nearest_landmark) || 'unknown',
      nearest_park: sanitizeIntelField(parsed.nearest_park) || 'unknown',
      nearest_trail: sanitizeIntelField(parsed.nearest_trail) || 'unknown',
      description_addendum:
        sanitizeIntelField(parsed.description_addendum) ||
        'Additional geographic insight unavailable.',
    });
    locationIntel = postProcessLocationIntel(locationIntel);

    const durationMs = 0;
    const { usage, model } = extractUsageFromResponse(response);
    debugUsage = accumulateDebugUsage(debugUsage, {
      step: 'location_intelligence_agent',
      model: model || locationModel,
      usage,
      durationMs,
      notes: 'Expert location detective LLM call',
      request: { systemPrompt, userPrompt },
      response: locationIntel,
      prompt: userPrompt,
    });
  } catch (err) {
    logger.warn('[LangGraph] location_intelligence_agent LLM fallback', err?.message || err);
    const fallback = buildLocationIntelDefaults({
      city: sanitizeIntelField(reverseResult?.city) || 'unknown',
      region: sanitizeIntelField(reverseResult?.region) || sanitizeIntelField(reverseResult?.state) || 'unknown',
      nearest_landmark: sanitizeIntelField(nearby?.[0]?.name) || 'unknown',
      nearest_park: sanitizeIntelField(
        nearby.find((place) => (place?.category || '').toLowerCase() === 'park')?.name
      ) || 'unknown',
      nearest_trail:
        sanitizeIntelField(osmTrails?.[0]?.name) ||
        sanitizeIntelField(
          nearby.find((place) => (place?.category || '').toLowerCase() === 'trail')?.name
        ) ||
        'unknown',
      description_addendum: 'Derived from reverse geocode fallback.',
    });
    locationIntel = fallback;
  }

  const bestMatch = selectBestNearby(nearby, locationIntel);
  if (bestMatch) {
    logger.info(
      `[infer_poi] Found ${nearby.length} nearby POIs. Best match: ${bestMatch.name} (${bestMatch.category || 'unknown'})`
    );
  } else {
    logger.info('[infer_poi] No relevant POIs found, falling back to reverse geocode only.');
  }
  const poiAnalysis = {
    locationIntel,
    city: locationIntel.city,
    region: locationIntel.region,
    nearest_landmark: locationIntel.nearest_landmark,
    nearest_park: locationIntel.nearest_park,
    nearest_trail: locationIntel.nearest_trail,
    description_addendum: locationIntel.description_addendum,
    heading_degrees: heading,
    heading_cardinal: headingCardinal,
    altitude_meters: altitude,
    timestamp: timestamp,
    gpsString,
    address: reverseResult?.address || null,
    bestMatchPOI: bestMatch || null,
    bestMatchCategory: bestMatch?.category || null,
    poiConfidence: bestMatch ? 'medium' : 'low',
    nearbyPOIs: nearby,
    nearbyTrailsOSM: osmTrails,
  };

  return { ...state, poiAnalysis, debugUsage };
}

// --- Node: decide_scene_label (new) ---
async function decide_scene_label(state) {
  let debugUsage = state.debugUsage;
  try {
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

    const categoryPriority = ['attraction', 'park', 'trail', 'hotel', 'restaurant'];
    const nearby = Array.isArray(state.poiAnalysis?.nearbyPOIs) ? state.poiAnalysis.nearbyPOIs : [];
    let poiCandidate = null;
    for (const category of categoryPriority) {
      const match = nearby.find((place) => (place?.category || '').toLowerCase() === category);
      if (match) {
        poiCandidate = match;
        break;
      }
    }
    if (!poiCandidate && state.poiAnalysis?.bestMatchPOI) {
      poiCandidate = state.poiAnalysis.bestMatchPOI;
    }

    const chosenLabelFallback = state.poiAnalysis?.address || null;
    let chosenLabel = null;
    let rationale = '';
    let confidence = 'low';

    if (poiCandidate && poiCandidate.name) {
      const category = (poiCandidate.category || 'location').toLowerCase();
      const categoryIndex = categoryPriority.indexOf(category);
      const tagSnippet = tags.slice(0, 3).join(', ') || 'general scene tags';
      chosenLabel = poiCandidate.name;
      rationale = `Nearest ${category} matches scene tags (${tagSnippet}).`;
      if (categoryIndex === 0) {
        confidence = 'high';
      } else if (categoryIndex >= 1 && categoryIndex <= 2) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }
    } else if (chosenLabelFallback) {
      chosenLabel = chosenLabelFallback;
      rationale = 'No POI match; using reverse geocode address.';
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

// --- Node: food_location_agent (new) ---
async function food_location_agent(state) {
  try {
    logger.info('[LangGraph] food_location_agent: Enter', { photoId: state.filename || state.file || null });
    const coordinates = parseGpsCoordinates(state);
    if (!coordinates) {
      logger.info('[LangGraph] food_location_agent: No GPS coordinates available, skipping food POI lookup');
      return { ...state, nearby_food_places: [], best_restaurant_candidate: null };
    }
    const lat = coordinates.lat;
    const lon = coordinates.lon;
    let nearby = [];
    try {
      // Use a 100ft (30.48m) radius for lookup; keep tests override
      if (Array.isArray(state.__overrideNearby)) {
        nearby = state.__overrideNearby;
      } else {
        nearby = await nearbyFoodPlaces(lat, lon, 30.48);
      }
    } catch (err) {
      logger.warn('[LangGraph] food_location_agent: nearbyFoodPlaces failed', err && err.message ? err.message : err);
      nearby = [];
    }

    // This node is intentionally a "dumb" finder: return the full set of nearby POIs
    // and let downstream nodes (food_metadata_agent) decide which is the best match.
    // Summarize nearby list and log best candidate info for observability
    const nearbyCount = Array.isArray(nearby) ? nearby.length : 0;
    let loggingBest = null;
    if (nearbyCount) {
      const nearest = nearby.reduce((acc, c) => (!acc || (Number.isFinite(c.distanceMeters) && c.distanceMeters < (acc.distanceMeters || Number.POSITIVE_INFINITY)) ? c : acc), null);
      if (nearest) {
        loggingBest = {
          name: nearest.name,
          address: nearest.address || nearest.vicinity || null,
          distanceMeters: nearest.distanceMeters || null,
          placeId: nearest.placeId || nearest.id || null,
          source: nearest.source || 'unknown',
        };
      }
    }
    const exitLog = {
      photoId: state.filename || state.file || null,
      nearbyCount,
      best: loggingBest,
    };
    if (allowDevDebug) {
      // Include candidates only in dev debug mode to avoid noisy logs
      exitLog.candidates = (nearby || []).map(c => ({ name: c.name, address: c.address || c.vicinity || null, distanceMeters: c.distanceMeters || null, placeId: c.placeId || c.id, source: c.source || 'osm/google' }));
    }
    logger.info('[LangGraph] food_location_agent: Exit', exitLog);
    return { ...state, nearby_food_places: nearby, best_restaurant_candidate: null };
  } catch (err) {
    logger.warn('[LangGraph] food_location_agent: Error', err && err.message ? err.message : err);
    return { ...state, nearby_food_places: [], best_restaurant_candidate: null };
  }
}

// --- Node: food_metadata_agent (new) ---
async function food_metadata_agent(state) {
  let debugUsage = state.debugUsage;
  try {
    logger.info('[LangGraph] food_metadata_agent: Enter', { photoId: state.filename });
    const metadataForPrompt = metadataPayloadWithDirection(state);

  // --- NEW: Get location and time data for the prompt ---
  const promptPoi = state.poiAnalysis || {};
  const city = promptPoi.city || (promptPoi.locationIntel ? promptPoi.locationIntel.city : null) || promptPoi.location || promptPoi.region || null;
  const region = promptPoi.region || (promptPoi.locationIntel ? promptPoi.locationIntel.region : null) || null;
    const locationString = [city, region].filter(Boolean).join(', '); // e.g., "Concord, CA"
    const timestamp = extractTimestamp(state.metadata); // e.g., "2025-02-17 21:18:28"
    // --- END NEW ---

    const systemPrompt = 'You are a professional photo archivist. Your tone is informative, concise, and professional. Return ONLY a JSON object.';
    const userPrompt = `Photo context:\nclassification: ${state.classification}\nphoto_timestamp: ${timestamp || 'unknown'}\nphoto_location: ${locationString || 'unknown'}\nnearby_food_places: ${JSON.stringify(state.nearby_food_places)}\n\nInstructions:\nYou are an expert food scene analyst. Your job is to identify the dish in the photo and determine the most likely restaurant it came from, using the 'nearby_food_places' list.\n\n1.  **Analyze the Photo:** First, identify the dish (e.g., "Seafood Boil," "Clams," "Pizza," "Burger").\n2.  **Analyze the Candidates:** Look at the 'nearby_food_places' list. This list contains ALL restaurants found within ~100ft of the photo's GPS.\n3.  **Make a Decision:**\n    * If the photo (e.g., a "Seafood Boil") is a **strong logical match** for one of the candidates (e.g., "Cajun Crackn Concord"), you MUST select that candidate.\n    * If there are **multiple logical matches**, choose the most plausible one (e.g., a "Seafood Platter" is more likely from "Merriman's" than a fast-food place).\n    * If there are **NO logical matches** (e.g., photo is "Seafood," list has "Jamba Juice"), you MUST ignore all candidates.\n\n4.  **Generate Content:**\n    * **restaurant_name:** The name of your selected candidate (or null if no match).\n    * **description:** Write a professional, 1-2 sentence archival description.\n        * **If you found a match:** The description MUST include the dish name and the full restaurant name. Example: "A Cajun-style seafood boil enjoyed at Cajun Crackn Concord."\n        * **If you did NOT find a match:** Write a generic description of the dish. Example: "A close-up of a Cajun-style seafood boil."\n        * **Always** try to append the location and date, like: "...in [photo_location] on [photo_timestamp]."\n    * **keywords:** Include the dish, cuisine, and restaurant name (if found).\n\nRespond with a JSON object with keys: caption, description, dish_name, dish_type, cuisine, restaurant_name (string or null), restaurant_address (string or null), restaurant_confidence (0-1), restaurant_reasoning, nutrition_info (object), nutrition_confidence (0-1), location_summary, keywords (array).`;

    // Build user content array with high detail image
    const userContent = [
      { type: 'text', text: userPrompt },
      { type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'high' } },
    ];

    logger.debug('[LangGraph] food_metadata_agent: Prompt (truncated)', userPrompt.slice(0, 1000));
    // Log the actual messages passed to the LLM, but omit the image base64 for safety
    try {
      const sanitizedUserContent = userContent.map(item => {
        if (item.type === 'image_url' && item.image_url) {
          return { ...item, image_url: { url: `omitted:${state.imageMime || 'unknown'}`, detail: item.image_url.detail } };
        }
        return item;
      });
      const sanitizedMessages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: sanitizedUserContent }];
      if (allowDevDebug) {
        logger.info('[LLM] food_metadata_agent messages (sanitized): %s', JSON.stringify(sanitizedMessages, null, 2));
      } else {
        logger.debug('[LLM] food_metadata_agent messages (sanitized): %s', JSON.stringify(sanitizedMessages, null, 2));
      }
    } catch (err) {
      logger.warn('[LLM] food_metadata_agent: Failed to log sanitized messages', err && err.message ? err.message : err);
    }

    const configuredModel = state.modelOverrides?.defaultModel || 'gpt-4o-mini';
    const response = await openai.chat.completions.create({
      model: configuredModel,
      messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userContent } ],
      max_tokens: 512,
      response_format: { type: 'json_object' },
    });
    const raw = response?.choices?.[0]?.message?.content || '{}';
    logger.debug('[LangGraph] food_metadata_agent: Model raw (truncated)', raw.slice(0, 1000));

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn('[LangGraph] food_metadata_agent: Failed to parse JSON response', err && err.message ? err.message : err, raw.slice(0, 1000));
      return { ...state, error: 'Failed to parse food metadata response' };
    }

    // Ensure we at least set finalResult caption/description/keywords
    const finalParsed = {
      caption: parsed.caption || (parsed.dish_name ? parsed.dish_name : (parsed.description ? parsed.description.slice(0, 80) : 'Food photo')),
      description: parsed.description || parsed.caption || '',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.join(', ') : (parsed.keywords || (parsed.cuisine ? `${parsed.cuisine}` : 'food')),
      classification: state.classification,
    };

    // Update poiAnalysis with food-specific fields
    const foodData = {
      dish_name: parsed.dish_name || null,
      dish_type: parsed.dish_type || null,
      cuisine: parsed.cuisine || null,
      restaurant_name: parsed.restaurant_name || (state.best_restaurant_candidate ? state.best_restaurant_candidate.name : null),
      restaurant_address: parsed.restaurant_address || (state.best_restaurant_candidate ? state.best_restaurant_candidate.address : null),
      restaurant_confidence: parseNumber(parsed.restaurant_confidence) || (state.best_restaurant_candidate ? 0.6 : 0.0),
      restaurant_reasoning: parsed.restaurant_reasoning || null,
      location_summary: parsed.location_summary || null,
    };

    // Instead of promoting a pre-computed best_candidate, the LLM is responsible
    // for selecting the best POI from nearby_food_places. The model should include
    // a 'chosen_place_id' in its response pointing to a placeId from nearby_food_places
    // (or null if uncertain). Use the chosen POI for structured fields if present.
    const chosenPlaceId = parsed.chosen_place_id || parsed.chosen_placeId || parsed.restaurant_place_id || null;
    let chosenCandidate = null;
    if (chosenPlaceId && Array.isArray(state.nearby_food_places)) {
      chosenCandidate = state.nearby_food_places.find(p => p.placeId === chosenPlaceId || p.place_id === chosenPlaceId) || null;
    }
    // If the model set restaurant_name explicitly, prefer that; otherwise, if a
    // chosenCandidate exists, use its structured data.
    const parsedRestaurantConfidence = parseNumber(parsed.restaurant_confidence);
    const impliedConfidence = parsedRestaurantConfidence != null ? parsedRestaurantConfidence : 0.85;
    if (chosenCandidate && impliedConfidence >= 0.5) {
      // Accept the model's selected candidate only when it declares at least 0.5 confidence (or unspecified confidence defaults to 0.85)
      foodData.restaurant_name = parsed.restaurant_name || chosenCandidate.name;
      foodData.restaurant_address = parsed.restaurant_address || chosenCandidate.address || chosenCandidate.vicinity || foodData.restaurant_address;
      foodData.restaurant_confidence = impliedConfidence;
      foodData.restaurant_reasoning = parsed.restaurant_reasoning || `Selected ${chosenCandidate.name} from nearby candidates based on the image and metadata.`;
    } else if (parsed.restaurant_name) {
      // model found a restaurant name but did not select a POI; accept the name without an associated POI
      foodData.restaurant_name = parsed.restaurant_name;
      foodData.restaurant_address = parsed.restaurant_address || foodData.restaurant_address;
      foodData.restaurant_confidence = parseNumber(parsed.restaurant_confidence) || (foodData.restaurant_confidence || 0.6);
      foodData.restaurant_reasoning = parsed.restaurant_reasoning || null;
    }

    // Nutrition: If we have dish and restaurant, try to call nutrition search
    let nutrition = parsed.nutrition_info || null;
    let nutrition_conf = parseNumber(parsed.nutrition_confidence) || 0.0;
    if (!nutrition && (foodData.restaurant_name || foodData.dish_name)) {
      try {
        const searchResult = await fetchDishNutrition({ restaurantName: foodData.restaurant_name, dishName: foodData.dish_name });
        if (searchResult) {
          nutrition = searchResult;
          nutrition_conf = 0.85; // reasonably confident
          logger.info('[LangGraph] food_metadata_agent: Nutrition lookup success');
        } else {
          logger.info('[LangGraph] food_metadata_agent: Nutrition lookup returned no structured data; asking model for estimate');
          // Ask the model to estimate nutrition if no external data
          const estimatePrompt = `Estimate nutrition for ${foodData.dish_name || 'the dish'} as a typical single serving. Return JSON: {"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number, "notes":"..."}`;
          const estimateResp = await openai.chat.completions.create({
            model: configuredModel,
            messages: [ { role: 'system', content: 'You are a nutrition estimator. Provide best-effort numeric nutrition information.' }, { role: 'user', content: estimatePrompt } ],
            max_tokens: 256,
            response_format: { type: 'json_object' },
          });
          try {
            const estRaw = estimateResp?.choices?.[0]?.message?.content || '{}';
            const estParsed = JSON.parse(estRaw);
            nutrition = {
              calories: parseNumber(estParsed.calories) || null,
              protein_g: parseNumber(estParsed.protein_g) || null,
              carbs_g: parseNumber(estParsed.carbs_g) || null,
              fat_g: parseNumber(estParsed.fat_g) || null,
              notes: estParsed.notes || 'Estimated values',
            };
            nutrition_conf = 0.4; // lower confidence
          } catch (err) {
            logger.warn('[LangGraph] food_metadata_agent: Nutrition estimate parsing failed', err && err.message ? err.message : err);
          }
        }
      } catch (err) {
        logger.warn('[LangGraph] food_metadata_agent: Nutrition search failed', err && err.message ? err.message : err);
      }
    }

    // Attach food-specific data into poiAnalysis and optionally set best_restaurant_candidate
    const poi = { ...(state.poiAnalysis || {}), food: { ...foodData, nutrition_info: nutrition, nutrition_confidence: nutrition_conf } };
    // Set best_restaurant_candidate based on chosenCandidate (model's pick) if provided and confident
    let bestCandidateObj = state.best_restaurant_candidate || null;
    if (chosenCandidate && impliedConfidence >= 0.5) {
      bestCandidateObj = { ...chosenCandidate, matchScore: null, keywordMatches: [] };
    }

    const { usage, model } = extractUsageFromResponse(response);
    debugUsage = accumulateDebugUsage(debugUsage, {
      step: 'food_metadata_agent',
      model: model || configuredModel,
      usage,
      durationMs: 0,
      notes: 'Food metadata LLM call',
      request: { systemPrompt, userPrompt },
      response: parsed,
      prompt: userPrompt,
    });

  logger.info('[LangGraph] food_metadata_agent: Exit', { photoId: state.filename, dish: parsed.dish_name });
  return { ...state, finalResult: finalParsed, poiAnalysis: poi, best_restaurant_candidate: bestCandidateObj, debugUsage, error: null };
  } catch (err) {
    logger.warn('[LangGraph] food_metadata_agent: Error', err && err.message ? err.message : err);
    return { ...state, error: err && err.message ? err.message : String(err) };
  }
}

// --- Router: Decides next node after the location intelligence agent ---
function route_after_location(state) {
  if (state.error) {
    logger.error('[LangGraph] Router: Error detected, ending graph.', state.error);
    return END;
  }

  const classification = String(state.classification || '').toLowerCase().trim();
  logger.info(`[LangGraph] Router: Routing after location intel for "${classification}"`);

  if (classification === 'collectables') {
    return 'handle_collectible';
  }

  if (classification === 'food') {
    return 'food_location_agent';
  }

  if (needPoi(state) && (classification === 'scenery' || classification.includes('scenery'))) {
    return 'decide_scene_label';
  }

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
workflow.addNode('location_intelligence_agent', location_intelligence_agent);
workflow.addNode('decide_scene_label', decide_scene_label);
workflow.addNode('food_location_agent', food_location_agent);
workflow.addNode('food_metadata_agent', food_metadata_agent);

// 2. Set the entry point
workflow.setEntryPoint('classify_image');

// 3. Wire the flow: classification -> location intelligence -> rest
workflow.addEdge('classify_image', 'location_intelligence_agent');

workflow.addConditionalEdges(
  'location_intelligence_agent',
  route_after_location,
  {
    generate_metadata: 'generate_metadata',
    decide_scene_label: 'decide_scene_label',
    handle_collectible: 'handle_collectible',
    food_location_agent: 'food_location_agent',
    __end__: END,
  }
);

// 4. Add the final edges
workflow.addEdge('generate_metadata', END);
workflow.addEdge('handle_collectible', END);
workflow.addEdge('decide_scene_label', 'generate_metadata');
workflow.addEdge('food_location_agent', 'food_metadata_agent');
workflow.addEdge('food_metadata_agent', END);

// 5. Compile the app
const app = workflow.compile();
module.exports = { app, __testing: { food_location_agent, food_metadata_agent } };