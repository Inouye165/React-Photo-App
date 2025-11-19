const { LOCATION_INTEL_SYSTEM_PROMPT, LOCATION_INTEL_USER_PROMPT } = require('../../prompts/location_intelligence_agent');
const { openai } = require('../../openaiClient');
const logger = require('../../../logger');
const { reverseGeocode, nearbyPlaces } = require('../../poi/googlePlaces');
const { nearbyTrailsFromOSM } = require('../../poi/osmTrails');
const { collectContext } = require('../collect_context');
const { shouldSkipGenericPoi, isCollectablesClassification } = require('../classification_helpers');
const {
  parseGpsCoordinates,
  extractHeading,
  extractAltitude,
  extractTimestamp,
  headingToCardinal,
  buildLocationIntelDefaults,
  sanitizeIntelField,
  postProcessLocationIntel,
  selectBestNearby,
  extractUsageFromResponse,
  accumulateDebugUsage,
} = require('../utils');

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

  const classificationLower = (String(state.classification || '') || '').toLowerCase();
  const _isCollectables = isCollectablesClassification(classificationLower);
  const skipGenericPoi = shouldSkipGenericPoi(classificationLower);
  if (skipGenericPoi) {
    logger.info(`[infer_poi] GPS found: ${coordinates.lat.toFixed(4)},${coordinates.lon.toFixed(4)} — skipping Google Places due to classification=${classificationLower}`);
  } else {
    logger.info(`[infer_poi] GPS found: ${coordinates.lat.toFixed(4)},${coordinates.lon.toFixed(4)} — querying Google Places...`);
  }

  let reverseResult = null;
  let nearby = [];
  let osmTrails = [];
  if (coordinates) {
    try {
      reverseResult = state.poiCache?.reverseResult || (await reverseGeocode(coordinates.lat, coordinates.lon));
    } catch (err) {
      logger.warn('[LangGraph] location_intelligence_agent reverse geocode failed', err?.message || err);
    }

    try {
      const skipGeneric = shouldSkipGenericPoi(classificationLower);
      if (skipGeneric) {
        nearby = [];
      } else {
        nearby = state.poiCache?.nearbyPlaces || (await nearbyPlaces(coordinates.lat, coordinates.lon, 800));
      }
    } catch (err) {
      logger.warn('[LangGraph] location_intelligence_agent nearbyPlaces failed', err?.message || err);
    }

    // Curate food candidates similar to old behavior
    try {
      const skipGeneric = shouldSkipGenericPoi(classificationLower);
      if (skipGeneric) {
        state.nearby_food_places = [];
        state.nearby_food_places_curated = [];
        state.nearby_food_places_raw = [];
        state.best_restaurant_candidate = null;
        logger.info('[location_intel] classification=food or collectables → skipped POI curation; food_location_agent will perform restaurants lookup');
      } else {
        const FOOD_TYPES = ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'];
        const MAX_CANDIDATES = Number(process.env.FOOD_CANDIDATE_MAX || 5);
        const deterministicDistance = Number(process.env.FOOD_DETERMINISTIC_DISTANCE_METERS || 100);
        const deterministicMinRating = Number(process.env.FOOD_DETERMINISTIC_MIN_RATING || 4.0);

        const foodCandidates = Array.isArray(nearby)
          ? nearby.filter((p) => Array.isArray(p.types) && p.types.some((t) => FOOD_TYPES.includes(t)))
          : [];

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
            return Number(b.rating || 0) - Number(a.rating || 0);
          })
          .slice(0, Math.max(0, Number.isFinite(MAX_CANDIDATES) ? MAX_CANDIDATES : 5));

        state.nearby_food_places = nearby;
        state.nearby_food_places_curated = curated;
        state.nearby_food_places_raw = nearby;

        state.poiAnalysis = { ...(state.poiAnalysis || {}), food: { candidates: nearby, curated: curated } };

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
          state.poiAnalysis = { ...(state.poiAnalysis || {}), food: { ...(state.poiAnalysis?.food || {}), best: state.best_restaurant_candidate } };
        }

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
            state.best_restaurant_candidate = { ...best, deterministic: true };
            logger.info('[LangGraph] food_location_agent: Deterministic restaurant selected', { photoId: state.filename || null, name: best.name });
          }
        } catch {
          // no-op
        }
      }
    } catch (err) {
      logger.warn('[LangGraph] food_location_agent: failed to curate candidates', err?.message || err);
    }

    try {
      const classificationLower = (String(state.classification || '') || '').toLowerCase();
      const OSM_SKIP_CATEGORIES = (process.env.OSM_SKIP_CATEGORIES || 'food').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const shouldSkipOsm = OSM_SKIP_CATEGORIES.some((c) => classificationLower.includes(c));
      if (shouldSkipOsm) {
        logger.info('[LangGraph] location_intelligence_agent skipping OSM trails for food classification');
        osmTrails = [];
      } else {
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
  const systemPrompt = LOCATION_INTEL_SYSTEM_PROMPT;

  const userPrompt = LOCATION_INTEL_USER_PROMPT.replace('{structuredContext}', JSON.stringify(structuredContext, null, 2));

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
      description_addendum: sanitizeIntelField(parsed.description_addendum) || 'Additional geographic insight unavailable.',
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
      nearest_park: sanitizeIntelField(nearby.find((place) => (place?.category || '').toLowerCase() === 'park')?.name) || 'unknown',
      nearest_trail: sanitizeIntelField(osmTrails?.[0]?.name) || sanitizeIntelField(nearby.find((place) => (place?.category || '').toLowerCase() === 'trail')?.name) || 'unknown',
      description_addendum: 'Derived from reverse geocode fallback.',
    });
    locationIntel = fallback;
  }

  const bestMatch = selectBestNearby(nearby, locationIntel);
  if (bestMatch) {
    logger.info(`[infer_poi] Found ${nearby.length} nearby POIs. Best match: ${bestMatch.name} (${bestMatch.category || 'unknown'})`);
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

module.exports = location_intelligence_agent;