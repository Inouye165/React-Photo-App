const { reverseGeocode, nearbyPlaces } = require('../poi/googlePlaces');
const { nearbyFoodPlaces } = require('../poi/foodPlaces');
const { nearbyTrailsFromOSM } = require('../poi/osmTrails');
const logger = require('../../logger');

interface CollectContextParams {
  lat: number | null;
  lon: number | null;
  classification?: string;
  fetchFood?: boolean;
  runId?: string;
}

interface CollectContextResult {
  reverseResult: Record<string, unknown> | null;
  nearbyPlaces: unknown[];
  nearbyFood: unknown[];
  osmTrails: unknown[];
}

async function collectContext({ lat, lon, classification = '', fetchFood = false, runId }: CollectContextParams): Promise<CollectContextResult> {
  const { shouldSkipGenericPoi, isCollectablesClassification } = require('./classification_helpers');
  const classificationLower: string = String(classification || '').toLowerCase();
  const _isCollectables: boolean = isCollectablesClassification(classificationLower);
  const skipGenericPoi: boolean = shouldSkipGenericPoi(classificationLower);

  const out: CollectContextResult = {
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
      out.reverseResult = await reverseGeocode(lat, lon, { runId });
    }
  } catch (err: unknown) {
    logger.warn('[collectContext] reverseGeocode failed', (err as Error)?.message || err);
  }

  if (!skipGenericPoi) {
    try {
      out.nearbyPlaces = await nearbyPlaces(lat, lon, 800, { runId });
    } catch (err: unknown) {
      logger.warn('[collectContext] nearbyPlaces failed', (err as Error)?.message || err);
    }
  } else {
    // We intentionally skip generic POIs for food context to save cost
    out.nearbyPlaces = [];
  }

  if (fetchFood && !_isCollectables) {
    try {
      const fallback: number = Number(process.env.FOOD_POI_FALLBACK_RADIUS || '30.48');
      out.nearbyFood = await nearbyFoodPlaces(lat, lon, fallback);
    } catch (err: unknown) {
      logger.warn('[collectContext] nearbyFoodPlaces failed', (err as Error)?.message || err);
    }
  }

  try {
    const osmDefaultRadius: number = Number(process.env.OSM_TRAILS_DEFAULT_RADIUS_METERS || 200);
    if (!skipGenericPoi) {
      out.osmTrails = await nearbyTrailsFromOSM(lat, lon, osmDefaultRadius);
    } else {
      out.osmTrails = [];
    }
  } catch (err: unknown) {
    logger.warn('[collectContext] nearbyTrailsFromOSM failed', (err as Error)?.message || err);
  }

  return out;
}

export = { collectContext };
