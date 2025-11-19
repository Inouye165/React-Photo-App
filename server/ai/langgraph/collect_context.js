const { reverseGeocode, nearbyPlaces } = require('../poi/googlePlaces');
const { nearbyFoodPlaces } = require('../poi/foodPlaces');
const { nearbyTrailsFromOSM } = require('../poi/osmTrails');
const logger = require('../../logger');

async function collectContext({ lat, lon, classification = '', fetchFood = false }) {
  const { shouldSkipGenericPoi, isCollectablesClassification } = require('./classification_helpers');
  const classificationLower = String(classification || '').toLowerCase();
  const _isCollectables = isCollectablesClassification(classificationLower);
  const skipGenericPoi = shouldSkipGenericPoi(classificationLower);

  const out = {
    reverseResult: null,
    nearbyPlaces: [],
    nearbyFood: [],
    osmTrails: [],
  };

  if (!lat || !lon) return out;

  try {
    // Skip reverse geocode entirely for 'collectables' to avoid noisy
    // and expensive geo lookups that are not meaningful for collectibles.
    if (!_isCollectables) {
      out.reverseResult = await reverseGeocode(lat, lon);
    }
  } catch (err) {
    logger.warn('[collectContext] reverseGeocode failed', err?.message || err);
  }

  if (!skipGenericPoi) {
    try {
      out.nearbyPlaces = await nearbyPlaces(lat, lon, 800);
    } catch (err) {
      logger.warn('[collectContext] nearbyPlaces failed', err?.message || err);
    }
  } else {
    // We intentionally skip generic POIs for food context to save cost
    out.nearbyPlaces = [];
  }

  if (fetchFood && !_isCollectables) {
    try {
      const fallback = Number(process.env.FOOD_POI_FALLBACK_RADIUS || '30.48');
      out.nearbyFood = await nearbyFoodPlaces(lat, lon, fallback);
    } catch (err) {
      logger.warn('[collectContext] nearbyFoodPlaces failed', err?.message || err);
    }
  }

  try {
    const osmDefaultRadius = Number(process.env.OSM_TRAILS_DEFAULT_RADIUS_METERS || 200);
    if (!skipGenericPoi) {
      out.osmTrails = await nearbyTrailsFromOSM(lat, lon, osmDefaultRadius);
    } else {
      out.osmTrails = [];
    }
  } catch (err) {
    logger.warn('[collectContext] nearbyTrailsFromOSM failed', err?.message || err);
  }

  return out;
}

module.exports = { collectContext };