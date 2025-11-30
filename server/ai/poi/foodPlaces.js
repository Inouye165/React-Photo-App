require('../../env');
const logger = require('../../logger');
const { haversineDistanceMeters } = require('./geoUtils');
const auditLogger = require('../langgraph/audit_logger');

const ensureFetch = () => {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  return async (...args) => {
    const { default: fetchPolyfill } = await import('node-fetch');
    return fetchPolyfill(...args);
  };
};
function getFetchFn(customFetch) {
  if (customFetch) return customFetch;
  return ensureFetch();
}

const API_KEY =
  process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
const allowDevDebug = process.env.ALLOW_DEV_DEBUG === 'true';
if (!API_KEY) {
  logger.warn('[foodPlaces] GOOGLE_MAPS_API_KEY missing; food POI lookups will be skipped');
}

// Simple cache
const cache = new Map();
function cacheSet(key, value, ttlMs = 2 * 60 * 60 * 1000) {
  const expires = Date.now() + ttlMs;
  cache.set(key, { value, expires });
  logger.info(`[foodPlaces] 🔵 CACHE SET: key="${key}", items=${value.length}, ttl=${ttlMs}ms, expires=${new Date(expires).toISOString()}`);
}
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) {
    logger.info(`[foodPlaces] 🔵 CACHE MISS: key="${key}" - not found in cache`);
    return null;
  }
  if (Date.now() > entry.expires) {
    cache.delete(key);
    logger.info(`[foodPlaces] 🔵 CACHE EXPIRED: key="${key}" - deleted from cache`);
    return null;
  }
  logger.info(`[foodPlaces] 🔵 CACHE HIT: key="${key}", items=${entry.value.length}`);
  return entry.value;
}
function keyFor(lat, lon, radius) {
  // Keep cache key stable - default radius is 50 meters (164 feet)
  const key = `${Number(lat).toFixed(4)}:${Number(lon).toFixed(4)}:${Number(radius || 50)}`;
  logger.info(`[foodPlaces] 🔵 CACHE KEY GENERATED: lat=${lat}, lon=${lon}, radius=${radius} => "${key}"`);
  return key;
}

function redactUrl(url) {
  if (!API_KEY) return url;
  return url.replace(API_KEY, '****');
}

// Default radiusMeters is now 50 (164 feet)
// Expand to a configurable maximum radius (meters) when looking for restaurants
// Add env var FOOD_PLACES_MAX_RADIUS_METERS to allow config in CI/Prod
const FOOD_PLACES_MAX_RADIUS_METERS = Number(process.env.FOOD_PLACES_MAX_RADIUS_METERS || process.env.FOOD_PLACES_MAX_RADIUS_METERS || 1000);
const FOOD_PLACES_START_RADIUS_METERS = Number(process.env.FOOD_PLACES_START_RADIUS_METERS || 50);

async function nearbyFoodPlaces(lat, lon, radiusMeters = 15.24, opts = {}) {
  const runId = opts.runId || 'unknown-run-id';
  if (allowDevDebug) logger.info(`[foodPlaces] ========== STARTING nearbyFoodPlaces ==========`);
  if (allowDevDebug) logger.info(`[foodPlaces] 🔍 INPUT PARAMS: lat=${lat}, lon=${lon}, radiusMeters=${radiusMeters}`);
  if (allowDevDebug) logger.info(`[foodPlaces] 🔍 CONFIG: FOOD_PLACES_START_RADIUS_METERS=${FOOD_PLACES_START_RADIUS_METERS}, FOOD_PLACES_MAX_RADIUS_METERS=${FOOD_PLACES_MAX_RADIUS_METERS}`);
  
  if (!lat || !lon) {
    logger.info('[foodPlaces] ❌ Missing lat/lon, skipping');
    return [];
  }
  if (!API_KEY && !opts.fetch) {
    logger.info('[foodPlaces] ❌ No API_KEY and no custom fetch, returning empty');
    return [];
  }

  const fetchFn = getFetchFn(opts.fetch);
  // Build a sequence of radii to attempt (meters). Start at a sensible default,
  // step up, and cap at FOOD_PLACES_MAX_RADIUS_METERS.
  const startRadius = Math.max(radiusMeters, FOOD_PLACES_START_RADIUS_METERS);
  const maxRadius = Number.isFinite(FOOD_PLACES_MAX_RADIUS_METERS) ? FOOD_PLACES_MAX_RADIUS_METERS : 1000;

  if (allowDevDebug) logger.info(`[foodPlaces] 🔍 RADIUS CALC: startRadius=${startRadius}, maxRadius=${maxRadius}`);

  // Radii progression: start, 2x, 4x, and finally the max; de-duplicate and clamp
  const candidateRadii = [startRadius, Math.min(startRadius * 2, maxRadius), Math.min(startRadius * 4, maxRadius), maxRadius];
  const radii = Array.from(new Set(candidateRadii.map((r) => Math.round(r))));
  
  if (allowDevDebug) logger.info(`[foodPlaces] 🔍 RADII TO TRY: ${JSON.stringify(radii)}`);

  const typesToTry = ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'];
  if (allowDevDebug) logger.info(`[foodPlaces] 🔍 PLACE TYPES: ${JSON.stringify(typesToTry)}`);

  for (const r of radii) {
    if (allowDevDebug) logger.info(`[foodPlaces] ========== TRYING RADIUS ${r} meters ==========`);
    
    const cacheKey = keyFor(lat, lon, r);
    const cached = cacheGet(cacheKey);
    if (cached) {
      logger.info(`[foodPlaces] ✅ Returning ${cached.length} cached results for radius=${r}`);
      return cached;
    }

    let allResults = [];

    for (const type of typesToTry) {
      if (allowDevDebug) logger.info(`[foodPlaces] 🔍 API CALL: type="${type}", radius=${r}`);
      
      const p = new URLSearchParams({
        location: `${lat},${lon}`,
        radius: String(r),
        type,
        key: API_KEY || 'test',
      });
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p.toString()}`;
      if (allowDevDebug) logger.info('[foodPlaces] 🌐 URL (redacted):', redactUrl(url));
      
      try {
        auditLogger.logToolCall(runId, 'Google Nearby Places (Food)', { lat, lon, radius: r, type, url: redactUrl(url) }, 'Fetching...');
        const res = await fetchFn(url, { method: 'GET' });
        if (allowDevDebug) logger.info(`[foodPlaces] 📡 RESPONSE: status=${res.status}, ok=${res.ok}`);
        
        if (!res.ok) {
          const text = await res.text();
          logger.warn('[foodPlaces] ⚠️ Google Places returned error', { status: res.status, body: text?.slice?.(0, 200) });
          auditLogger.logToolCall(runId, 'Google Nearby Places (Food)', { lat, lon, radius: r, type, status: res.status }, { error: text });
          continue;
        }
        
        const json = await res.json();
        logger.info(`[foodPlaces] 📊 API RESPONSE STATUS: ${json.status}`);
        logger.info(`[foodPlaces] 📊 RESULTS COUNT: ${json.results?.length || 0}`);
        
        const results = Array.isArray(json.results) ? json.results : [];
        auditLogger.logToolCall(runId, 'Google Nearby Places (Food)', { lat, lon, radius: r, type }, results);
        
        if (results.length > 0) {
          logger.info(`[foodPlaces] ✅ Found ${results.length} results for type='${type}' radius=${r}`);
          
          // Log detailed info for each result
          results.forEach((r, idx) => {
            const placeLat = r.geometry?.location?.lat;
            const placeLon = r.geometry?.location?.lng;
            const distance = placeLat && placeLon ? haversineDistanceMeters(lat, lon, placeLat, placeLon) : null;
            
            logger.info(`[foodPlaces] 📍 RESULT #${idx + 1}:`, {
              name: r.name,
              place_id: r.place_id,
              types: r.types,
              vicinity: r.vicinity,
              lat: placeLat,
              lon: placeLon,
              distance_meters: distance,
              rating: r.rating,
              user_ratings_total: r.user_ratings_total,
              business_status: r.business_status,
              opening_hours: r.opening_hours?.open_now,
            });
          });
        } else {
          logger.info(`[foodPlaces] ⚠️ No results for type='${type}' radius=${r}`);
        }
        
        allResults = allResults.concat(results);
      } catch (err) {
        logger.warn('[foodPlaces] ❌ nearbyFoodPlaces exception', err && err.message ? err.message : err);
        continue;
      }
    }

    logger.info(`[foodPlaces] 📊 TOTAL RESULTS for radius=${r}: ${allResults.length} (before deduplication)`);

    if (allResults.length > 0) {
      const unique = new Map();
      
      for (const r of allResults) {
        const pid = r.place_id || `${r.name}:${r.geometry?.location?.lat || ''}:${r.geometry?.location?.lng || ''}`;
        
        if (unique.has(pid)) {
          logger.info(`[foodPlaces] 🔁 DUPLICATE SKIPPED: place_id=${pid}, name=${r.name}`);
          continue;
        }

        const placeLat = r.geometry?.location?.lat;
        const placeLon = r.geometry?.location?.lng;
        const distance = placeLat && placeLon ? haversineDistanceMeters(lat, lon, placeLat, placeLon) : null;

        logger.info(`[foodPlaces] ➕ ADDING TO UNIQUE SET:`, {
          placeId: pid,
          name: r.name,
          lat: placeLat,
          lon: placeLon,
          distance_meters: distance,
        });

        unique.set(pid, {
          placeId: pid,
          name: r.name || '',
          address: r.vicinity || r.formatted_address || null,
          types: r.types || [],
          rating: typeof r.rating === 'number' ? r.rating : null,
          userRatingsTotal: r.user_ratings_total || r.userRatingsTotal || null,
          lat: placeLat || null,
          lon: placeLon || null,
          distanceMeters: distance === null ? null : Number(distance),
          source: 'google',
        });
      }

      logger.info(`[foodPlaces] 📊 UNIQUE PLACES AFTER DEDUP: ${unique.size}`);

      const list = Array.from(unique.values()).sort((a, b) => {
        const da = a.distanceMeters == null ? Number.POSITIVE_INFINITY : a.distanceMeters;
        const db = b.distanceMeters == null ? Number.POSITIVE_INFINITY : b.distanceMeters;
        return da - db;
      });

      logger.info(`[foodPlaces] 📊 SORTED LIST (top 10):`, JSON.stringify(
        list.slice(0, 10).map(p => ({
          name: p.name,
          distance_meters: p.distanceMeters,
          lat: p.lat,
          lon: p.lon,
        })),
        null,
        2
      ));

      cacheSet(cacheKey, list);
      logger.info(`[foodPlaces] ✅✅✅ RETURNING ${list.length} candidates for ${lat},${lon} at radius=${r}`);
      logger.info(`[foodPlaces] ========== END nearbyFoodPlaces (SUCCESS) ==========`);
      return list;
    }

    logger.info(`[foodPlaces] ⚠️ No food POIs at radius=${r} for ${lat},${lon}, trying next radius...`);
  }

  // Nothing found at any radius
  logger.info(`[foodPlaces] ❌ NO RESULTS at any radius for ${lat},${lon}`);
  const lastKey = keyFor(lat, lon, radii[radii.length - 1]);
  cacheSet(lastKey, []);
  logger.info(`[foodPlaces] ========== END nearbyFoodPlaces (EMPTY) ==========`);
  return [];
}


module.exports = { nearbyFoodPlaces };