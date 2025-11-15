require('../../env');
const logger = require('../../logger');
const { haversineDistanceMeters } = require('./geoUtils');

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
}
function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}
function keyFor(lat, lon, radius) {
  return `${Number(lat).toFixed(4)}:${Number(lon).toFixed(4)}:${Number(radius || 250)}`;
}

function redactUrl(url) {
  if (!API_KEY) return url;
  return url.replace(API_KEY, '****');
}

async function nearbyFoodPlaces(lat, lon, radiusMeters = 250, opts = {}) {
  if (!lat || !lon) {
    logger.info('[foodPlaces] nearbyFoodPlaces: Missing lat/lon, skipping');
    return [];
  }
  if (!API_KEY && !opts.fetch) return [];
  const fetchFn = getFetchFn(opts.fetch);
  const cacheKey = keyFor(lat, lon, radiusMeters);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;


  // We can try multiple types in sequence if needed (restaurant, cafe, bakery, bar, meal_takeaway)
  const typesToTry = ['restaurant', 'cafe', 'bakery', 'bar', 'meal_takeaway', 'meal_delivery'];
  let allResults = [];
  for (const type of typesToTry) {
    const p = new URLSearchParams({ location: `${lat},${lon}`, radius: String(radiusMeters), type, key: API_KEY || 'test' });
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${p.toString()}`;
    if (allowDevDebug) logger.info('[foodPlaces] Calling Google Places (redacted):', redactUrl(url));
    try {
      const res = await fetchFn(url, { method: 'GET' });
      if (!res.ok) {
        const text = await res.text();
        logger.warn('[foodPlaces] Google Places returned error', { status: res.status, body: text?.slice?.(0, 200) });
        continue;
      }
      const json = await res.json();
      const results = Array.isArray(json.results) ? json.results : [];
      allResults = allResults.concat(results);
    } catch (err) {
      logger.warn('[foodPlaces] nearbyFoodPlaces exception', err && err.message ? err.message : err);
      continue;
    }
  }

  // Normalize and dedupe by place_id
  const unique = new Map();
  for (const r of allResults) {
    const pid = r.place_id || `${r.name}:${r.geometry?.location?.lat || ''}:${r.geometry?.location?.lng || ''}`;
    if (unique.has(pid)) continue;
    const placeLat = r.geometry?.location?.lat;
    const placeLon = r.geometry?.location?.lng;
    const distance = placeLat && placeLon ? haversineDistanceMeters(lat, lon, placeLat, placeLon) : null;
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

  const list = Array.from(unique.values()).map((p) => ({ ...p }));
  list.sort((a, b) => {
    const da = a.distanceMeters == null ? Number.POSITIVE_INFINITY : a.distanceMeters;
    const db = b.distanceMeters == null ? Number.POSITIVE_INFINITY : b.distanceMeters;
    return da - db;
  });

  cacheSet(cacheKey, list);
  logger.info(`[foodPlaces] nearbyFoodPlaces returning ${list.length} candidates for ${lat},${lon}`);
  return list;
}

module.exports = { nearbyFoodPlaces };
