const logger = require('../../../logger');
const { nearbyFoodPlaces } = require('../../poi/foodPlaces');
const { collectContext } = require('../collect_context');
const { parseGpsCoordinates } = require('../utils');

const FOOD_POI_FALLBACK_RADIUS: number = parseFloat(process.env.FOOD_POI_FALLBACK_RADIUS || '30.48');
const allowDevDebug: boolean = process.env.ALLOW_DEV_DEBUG === 'true';

interface FoodPlace {
  name: string;
  address?: string;
  vicinity?: string;
  distanceMeters?: number;
  placeId?: string;
  id?: string;
  source?: string;
  rating?: number;
  types?: string[];
  category?: string;
  confidence?: string;
  restaurant_confidence?: number;
  deterministic?: boolean;
}

async function food_location_agent(state: Record<string, any>): Promise<Record<string, any>> {
  try {
    logger.info('[LangGraph] food_location_agent: Enter', { photoId: state.filename || state.file || null, FOOD_POI_FALLBACK_RADIUS });
    const coordinates = parseGpsCoordinates(state);
    if (!coordinates) {
      logger.info('[LangGraph] food_location_agent: No GPS coordinates available, skipping food POI lookup');
      return { ...state, nearby_food_places: [], best_restaurant_candidate: null };
    }
    const lat: number = coordinates.lat;
    const lon: number = coordinates.lon;
    let nearby: FoodPlace[] = [];
    try {
      if (Array.isArray(state.__overrideNearby)) {
        nearby = state.__overrideNearby;
      } else {
        if (state.poiCache?.nearbyFood) {
          nearby = state.poiCache.nearbyFood;
        } else {
          try {
            const poi = await collectContext({ lat: lat, lon: lon, classification: state.classification, fetchFood: true, runId: state.runId });
            state.poiCache = { ...(state.poiCache || {}), ...poi };
            nearby = (poi.nearbyFood || []) as FoodPlace[];
          } catch (err: any) {
            logger.warn('[LangGraph] food_location_agent collectContext failed', err?.message || err);
            nearby = await nearbyFoodPlaces(lat, lon, FOOD_POI_FALLBACK_RADIUS);
          }
        }
      }
    } catch (err: any) {
      logger.warn('[LangGraph] food_location_agent: nearbyFoodPlaces failed', err && err.message ? err.message : err);
      nearby = [];
    }

    const nearbyCount: number = Array.isArray(nearby) ? nearby.length : 0;
    let loggingBest: Record<string, any> | null = null;
    if (nearbyCount) {
      const nearest = nearby.reduce((acc: FoodPlace | null, c: FoodPlace) => (!acc || (Number.isFinite(c.distanceMeters) && (c.distanceMeters as number) < (acc.distanceMeters || Number.POSITIVE_INFINITY)) ? c : acc), null);
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
    const exitLog: Record<string, any> = { photoId: state.filename || state.file || null, nearbyCount, best: loggingBest };
    if (allowDevDebug) {
      exitLog.candidates = (nearby || []).map((c: FoodPlace) => ({ name: c.name, address: c.address || c.vicinity || null, distanceMeters: c.distanceMeters || null, placeId: c.placeId || c.id, source: c.source || 'osm/google' }));
    }
    logger.info('[LangGraph] food_location_agent: Exit', exitLog);
    logger.info(`[food_location_agent] candidates=${nearbyCount}, best=${loggingBest ? loggingBest.name : 'none'}`);

    try {
      const FOOD_TYPES: string[] = ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'];
      const MAX_CANDIDATES: number = Number(process.env.FOOD_CANDIDATE_MAX || 5);
      const deterministicDistance: number = Number(process.env.FOOD_DETERMINISTIC_DISTANCE_METERS || 100);
      const deterministicMinRating: number = Number(process.env.FOOD_DETERMINISTIC_MIN_RATING || 4.0);

      const foodCandidates: FoodPlace[] = Array.isArray(nearby) ? nearby.filter((p: FoodPlace) => Array.isArray(p.types) && p.types!.some((t: string) => FOOD_TYPES.includes(t))) : [];
      const typedCandidates: FoodPlace[] = foodCandidates.length ? foodCandidates : (Array.isArray(nearby) ? nearby.filter((p: FoodPlace) => (p.category || '').toLowerCase() === 'restaurant') : []);
      const curated: FoodPlace[] = (typedCandidates.length ? typedCandidates : nearby || []).slice().sort((a: FoodPlace, b: FoodPlace) => {
        const da = Number(a.distanceMeters || Number.POSITIVE_INFINITY);
        const db = Number(b.distanceMeters || Number.POSITIVE_INFINITY);
        if (da !== db) return da - db;
        return Number(b.rating || 0) - Number(a.rating || 0);
      }).slice(0, Math.max(0, Number.isFinite(MAX_CANDIDATES) ? MAX_CANDIDATES : 5));

      state.nearby_food_places = nearby;
      state.nearby_food_places_curated = curated;
      state.nearby_food_places_raw = nearby;

      const prevPoi = state.poiAnalysis || {};
      const prevFood = prevPoi.food || {};
      const baseFood = { candidates: nearby, curated, raw: nearby };

      let deterministicFood = false;
      if (curated.length > 0) {
        const top: FoodPlace = curated[0];
        const dist: number = Number(top.distanceMeters || Number.POSITIVE_INFINITY);
        const rating: number = Number(top.rating || 0);
        if (dist <= deterministicDistance && rating >= deterministicMinRating) {
          state.best_restaurant_candidate = { ...top, deterministic: true };
          deterministicFood = true;
        } else {
          state.best_restaurant_candidate = null;
        }
      } else {
        state.best_restaurant_candidate = null;
      }

      const foodSummary: Record<string, any> = {
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
    } catch (err: any) {
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
  } catch (err: any) {
    logger.warn('[LangGraph] food_location_agent: Error', err && err.message ? err.message : err);
    return { ...state, nearby_food_places: [], best_restaurant_candidate: null };
  }
}

export = food_location_agent;
