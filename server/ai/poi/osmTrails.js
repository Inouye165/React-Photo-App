require('../../env');
const logger = require('../../logger');
const { haversineDistanceMeters } = require('./geoUtils');

// TODO: Ensure the UI displays "© OpenStreetMap contributors" when surfacing OSM trail data.

const ensureFetch = () => {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  return async (...args) => {
    const { default: fetchPolyfill } = await import('node-fetch');
    return fetchPolyfill(...args);
  };
};

const fetchFn = ensureFetch();
const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
// Default radius to search for trails (meters). Reduced to prevent excessive queries
// and to avoid surfacing trails far from the photo GPS. This is configurable via env.
const DEFAULT_OSM_RADIUS_METERS = Number(process.env.OSM_TRAILS_DEFAULT_RADIUS_METERS || 100);
const CACHE_TTL_MS = Number(process.env.OSM_CACHE_TTL_MS) || 6 * 60 * 60 * 1000; // 6 hours
const CACHE_MAX_ENTRIES = Number(process.env.OSM_CACHE_MAX_ENTRIES) || 100;
const cache = new Map();

function toCacheKey(lat, lon, radius) {
  const lat4 = Number(lat).toFixed(4);
  const lon4 = Number(lon).toFixed(4);
  return `${lat4}:${lon4}:${radius}`;
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

function cacheSet(key, value) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

function buildOverpassQuery(lat, lon, radiusMeters) {
  return `[out:json][timeout:25];\n(\n  way(around:${radiusMeters}, ${lat}, ${lon})[highway~"footway|path|cycleway"];\n  relation(around:${radiusMeters}, ${lat}, ${lon})[route~"hiking|foot|bicycle"];\n  way(around:${radiusMeters}, ${lat}, ${lon})[waterway=canal];\n);\nout tags center;`;
}

function normalizeElement(element, lat, lon) {
  const centerLat = element?.center?.lat ?? element?.lat ?? null;
  const centerLon = element?.center?.lon ?? element?.lon ?? null;
  if (centerLat == null || centerLon == null) return null;
  const distanceMeters = haversineDistanceMeters(lat, lon, centerLat, centerLon);
  return {
    id: `osm:${element.type}/${element.id}`,
    name: element?.tags?.name || null,
    category: 'trail',
    lat: centerLat,
    lon: centerLon,
    distanceMeters,
    source: 'osm',
    tags: element?.tags || {},
  };
}

async function nearbyTrailsFromOSM(lat, lon, radiusMeters = DEFAULT_OSM_RADIUS_METERS) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const endpoint = process.env.OSM_OVERPASS_ENDPOINT || DEFAULT_OVERPASS_ENDPOINT;
  const cacheKey = toCacheKey(lat, lon, radiusMeters);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const query = buildOverpassQuery(lat, lon, radiusMeters);
  const body = `data=${encodeURIComponent(query)}`;
  logger.info('[OSM] Querying Overpass for trails', {
    endpoint,
    radiusMeters,
  });

  let response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body,
    });
  } catch (err) {
    logger.warn('[OSM] Overpass request error', err?.message || err);
    return [];
  }

  if (!response.ok) {
    let text = null;
    try {
      text = await response.text();
    } catch (err) {
      text = err?.message || null;
    }
    logger.warn('[OSM] Overpass response not OK', {
      status: response.status,
      body: text,
    });
    return [];
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    logger.warn('[OSM] Failed to parse Overpass response', err?.message || err);
    return [];
  }

  const elements = Array.isArray(json?.elements) ? json.elements : [];
  const pois = elements
    .map((element) => normalizeElement(element, lat, lon))
    .filter(Boolean)
    .sort((a, b) => {
      const da = Number.isFinite(a.distanceMeters) ? a.distanceMeters : Number.POSITIVE_INFINITY;
      const db = Number.isFinite(b.distanceMeters) ? b.distanceMeters : Number.POSITIVE_INFINITY;
      return da - db;
    });

  cacheSet(cacheKey, pois);

  if (pois.length) {
    const nearest = pois[0];
    logger.info('[OSM] Found OSM trails', {
      count: pois.length,
      nearest: nearest.name || nearest.id,
      distanceMeters: Number.isFinite(nearest.distanceMeters)
        ? Math.round(nearest.distanceMeters)
        : null,
    });
  } else {
    logger.info('[OSM] No trails returned from Overpass query');
  }

  return pois;
}

module.exports = {
  nearbyTrailsFromOSM,
};
