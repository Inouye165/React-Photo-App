const logger = require('../../../logger');
const { collectContext } = require('../collect_context');
const { parseGpsCoordinates } = require('../utils');

interface PoiCacheSummary {
  reverse: boolean;
  nearbyPlacesCount: number;
  nearbyFoodCount: number;
  osmTrailsCount: number;
  durationMs: number;
}

async function collect_context(state: Record<string, any>): Promise<Record<string, any>> {
  try {
    logger.info('[LangGraph] collect_context: Enter', { photoId: state.filename });
    const coordinates = parseGpsCoordinates(state);
    if (!coordinates) {
      logger.info('[LangGraph] collect_context: No GPS available, skipping');
      return { ...state, poiCache: null };
    }
    const { lat, lon } = coordinates;
    const classification: string = state.classification || '';
    const startMs: number = Date.now();
    const fetchFood: boolean = String(classification || '').toLowerCase().includes('food');
    const poi = await collectContext({ lat, lon, classification, fetchFood, runId: state.runId });
    const durationMs: number = Date.now() - startMs;
    const summary: PoiCacheSummary = {
      reverse: !!poi.reverseResult && !!poi.reverseResult.address,
      nearbyPlacesCount: Array.isArray(poi.nearbyPlaces) ? poi.nearbyPlaces.length : 0,
      nearbyFoodCount: Array.isArray(poi.nearbyFood) ? poi.nearbyFood.length : 0,
      osmTrailsCount: Array.isArray(poi.osmTrails) ? poi.osmTrails.length : 0,
      durationMs,
    };
    logger.info('[LangGraph] collect_context: poiCache summary', { photoId: state.filename, ...summary });
    return { ...state, poiCache: poi, poiCacheSummary: summary, poiCacheFetchedAt: new Date().toISOString() };
  } catch (err: any) {
    logger.warn('[LangGraph] collect_context: Error', err && err.message ? err.message : err);
    return { ...state, poiCache: null };
  }
}

export = collect_context;
