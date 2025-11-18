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
const { collectContext } = require('./collect_context');

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

function summarizeMetadataForPrompt(meta = {}) {
  // Keep only compact, high-signal metadata for LLM prompts to avoid noise
  return {
    date: meta.DateTimeOriginal || meta.dateTime || null,
    gps: meta?.latitude && meta?.longitude ? `${meta.latitude},${meta.longitude}` : null,
    camera: meta.cameraModel || meta.Make || meta.Model || null,
    heading: extractHeading(meta) || null,
    altitude_meters: extractAltitude(meta) || null,
    // Keep only basic exposure info
    exposure: {
      iso: parseNumber(meta.ISO) || null,
      aperture: parseNumber(meta.FNumber) || null,
      shutter: meta.ExposureTime || null,
    }
  };
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
    // Reduce metadata complexity passed to the LLM to minimize prompt noise
    const metadataForPrompt = summarizeMetadataForPrompt(state.metadata || {});
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

  if (!state.poiCache) {
    try {
      state.poiCache = await collectContext({ lat: coordinates.lat, lon: coordinates.lon, classification: state.classification, fetchFood: false });
    } catch (err) {
      logger.warn('[LangGraph] location_intelligence_agent collectContext failed', err?.message || err);
      state.poiCache = null;
    }
  }

  logger.info(
    `[infer_poi] GPS found: ${coordinates.lat.toFixed(4)},${coordinates.lon.toFixed(4)} — querying Google Places...`
  );

  let reverseResult = null;
  let nearby = [];
  let osmTrails = [];
  if (coordinates) {
    try {
      reverseResult = state.poiCache?.reverseResult || (await reverseGeocode(coordinates.lat, coordinates.lon));
    } catch (err) {
      logger.warn('[LangGraph] location_intelligence_agent reverse geocode failed', err?.message || err);
    }

    // Note: Nearby places are loaded below from Google Places. We'll curate the
    // food-specific candidate list after we obtain the 'nearby' list to avoid
    // operating on an empty array. Deterministic selection happens below once
    // 'nearby' is populated.
    try {
      const classificationLower = (String(state.classification || '') || '').toLowerCase();
      const skipGenericPoi = classificationLower.includes('food');
      if (skipGenericPoi) {
        logger.info('[location_intel] classification=food → skipping generic POI/trails lookups');
        nearby = [];
      } else {
        nearby = state.poiCache?.nearbyPlaces || (await nearbyPlaces(coordinates.lat, coordinates.lon, 800));
      }
    } catch (err) {
      logger.warn('[LangGraph] location_intelligence_agent nearbyPlaces failed', err?.message || err);
    }
    

    // --- New: curate food-specific candidate list and deterministic selection
    // once nearby places are available.
    try {
      const classificationLower = (String(state.classification || '') || '').toLowerCase();
      const skipGenericPoi = classificationLower.includes('food');

      if (skipGenericPoi) {
        state.nearby_food_places = [];
        state.nearby_food_places_curated = [];
        state.nearby_food_places_raw = [];
        state.best_restaurant_candidate = null;
        logger.info('[location_intel] classification=food → skipped POI curation; food_location_agent will perform restaurants lookup');
      } else {
        const FOOD_TYPES = ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'];
        const MAX_CANDIDATES = Number(process.env.FOOD_CANDIDATE_MAX || 5);
        const deterministicDistance = Number(process.env.FOOD_DETERMINISTIC_DISTANCE_METERS || 100);
        const deterministicMinRating = Number(process.env.FOOD_DETERMINISTIC_MIN_RATING || 4.0);

        // Filter to likely food businesses first
        const foodCandidates = Array.isArray(nearby)
          ? nearby.filter((p) => Array.isArray(p.types) && p.types.some((t) => FOOD_TYPES.includes(t)))
          : [];

        // If no typed candidates, try a looser filter based on category
        const typedCandidates = foodCandidates.length
          ? foodCandidates
          : Array.isArray(nearby)
          ? nearby.filter((p) => (p.category || '').toLowerCase() === 'restaurant')
          : [];

        const curated = (typedCandidates.length ? typedCandidates : nearby || [])
          .slice()
          .sort((a, b) => {
            const da = Number(a.distanceMeters || Number.POSITIVE_INFINITY);
            const db = Number(b.distanceMeters || Number.POSITIVE_INFINITY);
            if (da !== db) return da - db;
            // If distances equal, prefer higher rating
            return Number(b.rating || 0) - Number(a.rating || 0);
          })
          .slice(0, Math.max(0, Number.isFinite(MAX_CANDIDATES) ? MAX_CANDIDATES : 5));

        // Attach the curated candidate list to the state for the LLM to see
        // Keep a full (raw) list of nearby candidates and attach a curated
        // subset for the LLM. This keeps existing behavior for callers that
        // expect the full list while providing a smaller candidate list for
        // the model to reason over.
        state.nearby_food_places = nearby;
        state.nearby_food_places_curated = curated;
        state.nearby_food_places_raw = nearby;

        // Also attach structured food POI summary to poiAnalysis so downstream
        // nodes (including the metadata agent) can find restaurant candidates
        // in one canonical place. This is used by the LLM prompt and by
        // deterministic overrides.
        state.poiAnalysis = { ...(state.poiAnalysis || {}), food: { candidates: nearby, curated: curated } };

        // Deterministic selection: pick the nearest candidate if it's very close and highly rated
        let preselected = null;
        if (curated.length > 0) {
          const top = curated[0];
          const dist = Number(top.distanceMeters || Number.POSITIVE_INFINITY);
          const rating = Number(top.rating || 0);
          if (dist <= deterministicDistance && rating >= deterministicMinRating) {
            preselected = top;
          }
        }

        if (preselected) {
          state.best_restaurant_candidate = { ...preselected, deterministic: true };
          // Mirror in poiAnalysis.food for downstream use
          state.poiAnalysis = { ...(state.poiAnalysis || {}), food: { ...(state.poiAnalysis?.food || {}), best: state.best_restaurant_candidate } };
        }

        // Deterministic override: if there is exactly one nearby candidate and
        // it appears to be a high-confidence match, mark it as deterministic so
        // the metadata agent will lock this restaurant into the final result.
        try {
          const best = state.best_restaurant_candidate || null;
          const nearbyLen = Array.isArray(state.nearby_food_places) ? state.nearby_food_places.length : 0;
          const src = (best && best.source) || null;
          const rating = Number(best?.rating || 0);
          const isHighConfidence =
            !!best &&
            nearbyLen === 1 &&
            (best.confidence === 'high' || (typeof best.restaurant_confidence === 'number' && best.restaurant_confidence >= 0.8) || src === 'google' || rating >= deterministicMinRating);
          if (isHighConfidence) {
            state.poiAnalysis = {
              ...(state.poiAnalysis || {}),
              food: {
                ...(state.poiAnalysis?.food || {}),
                restaurant_name: best.name,
                restaurant_address: best.address || best.vicinity || null,
                restaurant_confidence: 1,
                restaurant_reasoning: state.poiAnalysis?.food?.restaurant_reasoning || 'High-confidence restaurant candidate selected deterministically based on nearby_food_places.',
                deterministic_restaurant: true,
              },
            };
            // Also ensure the primary best_restaurant_candidate is in sync
            state.best_restaurant_candidate = { ...best, deterministic: true };
            logger.info('[LangGraph] food_location_agent: Deterministic restaurant selected', { photoId: state.filename || null, name: best.name });
          }
        } catch {
          // No-op on unexpected structure
        }
      }
    } catch (err) {
      logger.warn('[LangGraph] food_location_agent: failed to curate candidates', err?.message || err);
    }
    
    try {
      const classificationLower = (String(state.classification || '') || '').toLowerCase();
      // Skip expensive OSM trails lookups for food photos — handled by the food agent
      // Allow multiple categories to be configured, but default only 'food'
      const OSM_SKIP_CATEGORIES = (process.env.OSM_SKIP_CATEGORIES || 'food').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const shouldSkipOsm = OSM_SKIP_CATEGORIES.some((c) => classificationLower.includes(c));
      if (shouldSkipOsm) {
        logger.info('[LangGraph] location_intelligence_agent skipping OSM trails for food classification');
        osmTrails = [];
      } else {
        // Use configurable default radius for OSM trails; default to a short radius
        const osmDefaultRadius = Number(process.env.OSM_TRAILS_DEFAULT_RADIUS_METERS || 200);
        osmTrails = state.poiCache?.osmTrails || (await nearbyTrailsFromOSM(coordinates.lat, coordinates.lon, osmDefaultRadius));
      }
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
    logger.info('[LangGraph] food_location_agent: Enter', { photoId: state.filename || state.file || null, FOOD_POI_MATCH_SCORE_THRESHOLD, FOOD_POI_FALLBACK_RADIUS });
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
        // Use configured fallback radius (in meters) so tests and runtime can
        // easily change the search distance via env var.
        // Prefer a cached value if it exists to avoid extra API calls
        if (state.poiCache?.nearbyFood) {
          nearby = state.poiCache.nearbyFood;
        } else {
          // Collect food-specific POI data and cache it for the remainder of the run
          try {
            const poi = await collectContext({ lat: lat, lon: lon, classification: state.classification, fetchFood: true });
            state.poiCache = { ...(state.poiCache || {}), ...poi };
            nearby = poi.nearbyFood || [];
          } catch (err) {
            logger.warn('[LangGraph] food_location_agent collectContext failed', err?.message || err);
            nearby = await nearbyFoodPlaces(lat, lon, FOOD_POI_FALLBACK_RADIUS);
          }
        }
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
    // Log a compact summary of food candidates for observability
    logger.info(`[food_location_agent] candidates=${nearbyCount}, best=${loggingBest ? loggingBest.name : 'none'}`);
    // Curate and attach a smaller candidate list for the LLM to use. We also
    // set a deterministic `best_restaurant_candidate` when the nearest
    // candidate is within a small distance and above a rating threshold.
    try {
      const FOOD_TYPES = ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'];
      const MAX_CANDIDATES = Number(process.env.FOOD_CANDIDATE_MAX || 5);
      const deterministicDistance = Number(process.env.FOOD_DETERMINISTIC_DISTANCE_METERS || 100);
      const deterministicMinRating = Number(process.env.FOOD_DETERMINISTIC_MIN_RATING || 4.0);

      const foodCandidates = Array.isArray(nearby) ? nearby.filter(p => Array.isArray(p.types) && p.types.some(t => FOOD_TYPES.includes(t))) : [];
      const typedCandidates = foodCandidates.length ? foodCandidates : (Array.isArray(nearby) ? nearby.filter(p => (p.category || '').toLowerCase() === 'restaurant') : []);
      const curated = (typedCandidates.length ? typedCandidates : nearby || []).slice().sort((a, b) => {
        const da = Number(a.distanceMeters || Number.POSITIVE_INFINITY);
        const db = Number(b.distanceMeters || Number.POSITIVE_INFINITY);
        if (da !== db) return da - db;
        return Number(b.rating || 0) - Number(a.rating || 0);
      }).slice(0, Math.max(0, Number.isFinite(MAX_CANDIDATES) ? MAX_CANDIDATES : 5));

      // Keep the full list of nearby places for callers; attach the curated
      // subset for the LLM while preserving the raw list.
      state.nearby_food_places = nearby;
      state.nearby_food_places_curated = curated;
      state.nearby_food_places_raw = nearby;

      const prevPoi = state.poiAnalysis || {};
      const prevFood = prevPoi.food || {};
      const baseFood = { candidates: nearby, curated, raw: nearby };

      // Set deterministic preselection when clear winner is within threshold
      let deterministicFood = false;
      if (curated.length > 0) {
        const top = curated[0];
        const dist = Number(top.distanceMeters || Number.POSITIVE_INFINITY);
        const rating = Number(top.rating || 0);
        if (dist <= deterministicDistance && rating >= deterministicMinRating) {
          state.best_restaurant_candidate = { ...top, deterministic: true };
          deterministicFood = true;
        } else {
          state.best_restaurant_candidate = null;
        }
      } else {
        state.best_restaurant_candidate = null;
      }

      const foodSummary = {
        ...baseFood,
        best: state.best_restaurant_candidate || prevFood.best || null,
        restaurant_name: deterministicFood ? state.best_restaurant_candidate?.name || prevFood.restaurant_name || null : prevFood.restaurant_name || null,
        restaurant_address: deterministicFood ? state.best_restaurant_candidate?.address || state.best_restaurant_candidate?.vicinity || prevFood.restaurant_address || null : prevFood.restaurant_address || null,
        restaurant_confidence: deterministicFood ? 1 : prevFood.restaurant_confidence || null,
        restaurant_reasoning: deterministicFood
          ? prevFood.restaurant_reasoning || 'High-confidence restaurant candidate selected deterministically based on nearby_food_places.'
          : prevFood.restaurant_reasoning || null,
        deterministic_restaurant: deterministicFood || prevFood.deterministic_restaurant || false,
      };
      state.poiAnalysis = { ...prevPoi, food: foodSummary };
    } catch (err) {
      logger.warn('[LangGraph] food_location_agent: curation failed', err && err.message ? err.message : err);
      state.nearby_food_places = nearby;
      state.best_restaurant_candidate = null;
    }

    return {
      ...state,
      nearby_food_places: state.nearby_food_places,
      best_restaurant_candidate: state.best_restaurant_candidate || null,
      poiAnalysis: state.poiAnalysis || null,
    };
  } catch (err) {
    logger.warn('[LangGraph] food_location_agent: Error', err && err.message ? err.message : err);
    return { ...state, nearby_food_places: [], best_restaurant_candidate: null };
  }
}

// --- Node: collect_context (central POI fetch) ---
async function collect_context(state) {
  try {
    logger.info('[LangGraph] collect_context: Enter', { photoId: state.filename });
    const coordinates = parseGpsCoordinates(state);
    if (!coordinates) {
      logger.info('[LangGraph] collect_context: No GPS available, skipping');
      return { ...state, poiCache: null };
    }
    // Always retrieve food-specific places too so downstream nodes don't need to
    // re-run a separate fetch. This consolidates costs into one call.
    const { lat, lon } = coordinates;
    const classification = state.classification || '';
    const startMs = Date.now();
    const poi = await collectContext({ lat, lon, classification, fetchFood: true });
    const durationMs = Date.now() - startMs;
    // attach a simple summary for observability
    const summary = {
      reverse: !!poi.reverseResult && !!poi.reverseResult.address,
      nearbyPlacesCount: Array.isArray(poi.nearbyPlaces) ? poi.nearbyPlaces.length : 0,
      nearbyFoodCount: Array.isArray(poi.nearbyFood) ? poi.nearbyFood.length : 0,
      osmTrailsCount: Array.isArray(poi.osmTrails) ? poi.osmTrails.length : 0,
      durationMs,
    };
    logger.info('[LangGraph] collect_context: poiCache summary', { photoId: state.filename, ...summary });
    return { ...state, poiCache: poi, poiCacheSummary: summary, poiCacheFetchedAt: new Date().toISOString() };
  } catch (err) {
    logger.warn('[LangGraph] collect_context: Error', err && err.message ? err.message : err);
    return { ...state, poiCache: null };
  }
}

function ensureRestaurantInDescription(description, restaurantName, photoLocation, photoTimestamp) {
  const desc = (description || '').trim();
  const name = (restaurantName || '').trim();
  if (!name) {
    return desc || '';
  }
  if (desc.toLowerCase().includes(name.toLowerCase())) {
    return desc;
  }
  const locationSuffix = photoLocation ? ` in ${photoLocation}` : '';
  const timeSuffix = photoTimestamp ? ` on ${photoTimestamp}` : '';
  if (desc) {
    return `${desc} This dish was enjoyed at ${name}${locationSuffix}${timeSuffix}.`;
  }
  return `A dish enjoyed at ${name}${locationSuffix}${timeSuffix}.`;
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

    const { FOOD_METADATA_SYSTEM_PROMPT, FOOD_METADATA_USER_PROMPT, FOOD_METADATA_CRITICAL_RULE_TEXT } = require('../prompts/food_metadata_agent');
    const systemPrompt = FOOD_METADATA_SYSTEM_PROMPT || 'You are a professional photo archivist. Your tone is informative, concise, and professional. Return ONLY a JSON object.';
    // Prefer the curated nearby list for the prompt to reduce noisy results from
    // OSM/trails or very distant POIs. Fall back to the full list if no curated
    // subset was generated by the earlier node.
    const nearbyForPrompt =
      state.nearby_food_places_curated ||
      state.poiAnalysis?.food?.curated ||
      state.nearby_food_places ||
      state.poiAnalysis?.food?.candidates ||
      [];
    // `foodMeta`, `deterministicRestaurant`, and lockedRestaurant* should be
    // available to the logger/sanity checks prior to the LLM call. Compute
    // them here once so other branches can reference them safely without
    // hitting the temporal-dead-zone for let/const declarations.
    const foodMeta = state.poiAnalysis?.food || {};
    const bestCandidate = state.best_restaurant_candidate || null;
    const deterministicRestaurant = !!foodMeta?.deterministic_restaurant || !!bestCandidate?.deterministic;
    const lockedRestaurantName = foodMeta?.restaurant_name || bestCandidate?.name || null;
    const lockedRestaurantAddress = foodMeta?.restaurant_address || bestCandidate?.address || null;
    let userPrompt = (FOOD_METADATA_USER_PROMPT || '').replace('{classification}', String(state.classification || '')).replace('{photo_timestamp}', String(timestamp || 'unknown')).replace('{photo_location}', String(locationString || 'unknown')).replace('{metadataForPrompt}', JSON.stringify(metadataForPrompt || {})).replace('{nearbyForPrompt}', JSON.stringify(nearbyForPrompt || []));
    userPrompt = userPrompt.replace('{CRITICAL_RULE_TEXT}', FOOD_METADATA_CRITICAL_RULE_TEXT || '');
    const CRITICAL_RULE_TEXT = '        * **CRITICAL FORMAT RULE:** If `restaurant_name` in your JSON is not null, the description MUST contain the exact `restaurant_name` string verbatim at least once. If it does not, rewrite the description so the restaurant name appears explicitly.';
    if (!userPrompt.includes('CRITICAL FORMAT RULE')) {
      const anchor = '        * **Always** try to append the location and date, like: "...in [photo_location] on [photo_timestamp]."\n    * **keywords:** Include the dish, cuisine, and restaurant name (if found).';
      const replacement = `        * **Always** try to append the location and date, like: "...in [photo_location] on [photo_timestamp]."\n${CRITICAL_RULE_TEXT}\n    * **keywords:** Include the dish, cuisine, and restaurant name (if found).`;
      userPrompt = userPrompt.replace(anchor, replacement);
    }
    // Be defensive: replace any accidental backtick-marked code items that would
    // otherwise break the template literal when included as text in the prompt.
    userPrompt = userPrompt.replace(/`deterministic_restaurant`/g, "'deterministic_restaurant'").replace(/`restaurant_name`/g, "'restaurant_name'").replace(/`restaurant_address`/g, "'restaurant_address'");

    // Build user content array with high detail image
    const userContent = [
      { type: 'text', text: userPrompt },
      { type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'high' } },
    ];

    logger.debug('[LangGraph] food_metadata_agent: Prompt (truncated)', userPrompt.slice(0, 1000));
    // Log a compact summary for debug purposes showing how many candidates
    // are available to the model and whether a preselected best candidate exists.
    const nearbyCount = Array.isArray(nearbyForPrompt) ? nearbyForPrompt.length : 0;
    const bestRestaurant = state.best_restaurant_candidate || state.poiAnalysis?.food?.best || null;
    logger.info(`[food_metadata_agent] photoId=${state.filename || 'unknown'}, nearby_food_places=${nearbyCount}, best=${bestRestaurant ? bestRestaurant.name : 'none'}, deterministic_restaurant=${deterministicRestaurant}`);
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

    // Respect deterministic preselection: if poiAnalysis.food indicates a locked
    // restaurant, we will override the model's restaurant fields after parsing
    // the LLM output. This keeps the LLM responsible for analyzing the dish
    // but prevents it from overriding a deterministic restaurant choice.
    // (foodMeta, deterministicRestaurant, lockedRestaurantName/address are
    // already computed and available above; do not re-declare them here.)

    // Instead of promoting a pre-computed best_candidate, the LLM is responsible
    // for selecting the best POI from nearby_food_places. The model should include
    // a 'chosen_place_id' in its response pointing to a placeId from nearby_food_places
    // (or null if uncertain). Use the chosen POI for structured fields if present.
    const chosenPlaceId = parsed.chosen_place_id || parsed.chosen_placeId || parsed.restaurant_place_id || null;
    let chosenCandidate = null;
    if (chosenPlaceId) {
      const candidateSource = state.nearby_food_places_curated || state.nearby_food_places || [];
      if (Array.isArray(candidateSource)) {
        chosenCandidate = candidateSource.find(p => p.placeId === chosenPlaceId || p.place_id === chosenPlaceId) || null;
      }
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

    // If a deterministic restaurant has been set, override any restaurant
    // fields from the model with the locked values and mark confidence=1.
    if (deterministicRestaurant) {
      foodData.restaurant_name = lockedRestaurantName;
      foodData.restaurant_address = lockedRestaurantAddress;
      foodData.restaurant_confidence = 1;
      foodData.restaurant_reasoning = foodData.restaurant_reasoning || 'Restaurant pre-selected deterministically from nearby_food_places.';
      foodData.deterministic_restaurant = true;
    }

    const enforcedDescription = ensureRestaurantInDescription(finalParsed.description, foodData.restaurant_name, locationString, timestamp);
    finalParsed.description = enforcedDescription;
    foodData.description = enforcedDescription;

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
    // Preserve any existing food metadata (for fields like deterministic_restaurant)
    const poi = {
      ...(state.poiAnalysis || {}),
      food: { ...(state.poiAnalysis?.food || {}), ...foodData, nutrition_info: nutrition, nutrition_confidence: nutrition_conf },
    };
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
workflow.addNode('collect_context', collect_context);

// 2. Set the entry point
workflow.setEntryPoint('classify_image');

// 3. Wire the flow: classification -> location intelligence -> rest
// Insert a short-circuit node that collects POI once per image and caches it.
workflow.addEdge('classify_image', 'collect_context');
workflow.addEdge('collect_context', 'location_intelligence_agent');

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
module.exports = { app, __testing: { food_location_agent, food_metadata_agent, location_intelligence_agent } };
// Export the collect_context node for unit testing
module.exports.__testing.collect_context = collect_context;