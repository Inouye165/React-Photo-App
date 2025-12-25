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
const allowDevDebug = process.env.ALLOW_DEV_DEBUG === 'true';
const STATUS_WARN_THROTTLE_MS = Number(process.env.GOOGLE_PLACES_STATUS_WARN_MS) || 5 * 60 * 1000;
const REQUEST_DENIED_BACKOFF_MS = Number(process.env.GOOGLE_PLACES_DENIED_BACKOFF_MS) || 10 * 60 * 1000;
const statusHistory = new Map();
let requestDeniedUntil = 0;
let lastBackoffNotice = 0;
const API_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_API_KEY;
let warned = false;
if (!API_KEY && !warned) {
  logger.warn('[POI] GOOGLE_MAPS_API_KEY missing; skipping POI lookups');
  warned = true;
}



function redactUrl(url) {
  if (!API_KEY) return url;
  return url.replace(API_KEY, '****');
}

// Simple in-memory TTL cache
const cache = new Map();
function cacheSet(key, value, ttlMs = 24 * 60 * 60 * 1000) {
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

function toKey(lat, lon, radius) {
  const lat4 = Number(lat).toFixed(4);
  const lon4 = Number(lon).toFixed(4);
  return `${lat4}:${lon4}:${radius}`;
}

function normalizeCategory(types = []) {
  const t0 = (types && types.length && types[0]) || '';
  const lowered = (t0 || '').toLowerCase();
  if (lowered.includes('park')) return 'park';
  if (['tourist_attraction', 'natural_feature'].some((x) => types.includes(x))) return 'attraction';
  if (lowered.includes('lodging')) return 'hotel';
  if (['restaurant', 'cafe', 'food', 'bar', 'fast_food'].some((x) => types.includes(x))) return 'restaurant';
  if (['store', 'supermarket', 'convenience_store'].some((x) => types.includes(x))) return 'store';
  if (/trail|trailhead/i.test(t0)) return 'trail';
  return t0 || 'unknown';
}

async function reverseGeocode(lat, lon, opts = {}) {
  const runId = opts.runId || 'unknown-run-id';
  if (!API_KEY) {
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon, status: 'skipped (no key)' }, null);
    return { address: null };
  }
  const cacheKey = `regeocode:${toKey(lat, lon, 0)}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon, status: 'cached' }, cached);
    return cached;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lon)}&key=${API_KEY}`;
  const fetchFn = getFetchFn(opts.fetch);
    // Allow tests to run without API key if custom fetch is injected
    if (!API_KEY && !opts.fetch) return { address: null };
    try {
      auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon, url: redactUrl(url) }, 'Fetching...');
      const res = await fetchFn(url, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text();
      logger.warn('[POI] reverseGeocode failed', { status: res.status, body: text });
      auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon, status: res.status }, { error: text });
      return { address: null };
    }
    const json = await res.json();
    const addr = Array.isArray(json.results) && json.results[0] ? json.results[0].formatted_address : null;
    const out = { address: addr };
    cacheSet(cacheKey, out);
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon }, out);
    return out;
  } catch (err) {
    logger.warn('[POI] reverseGeocode exception', err && err.message ? err.message : err);
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon }, { error: err.message });
    return { address: null };
  }
}

// 200 feet ≈ 61 meters
async function nearbyPlaces(lat, lon, radius = 61, opts = {}) {
  const runId = opts.runId || 'unknown-run-id';
  // Allow tests to run without API key if custom fetch is injected
  if (!API_KEY && !opts.fetch) {
    auditLogger.logToolCall(runId, 'Google Nearby Places', { lat, lon, radius, status: 'skipped (no key)' }, null);
    return [];
  }
  if (requestDeniedUntil && Date.now() < requestDeniedUntil) {
    if (allowDevDebug && Date.now() - lastBackoffNotice > 30_000) {
      console.warn(
        '[infer_poi] Skipping Google Places call because last attempt returned REQUEST_DENIED; backoff active'
      );
      lastBackoffNotice = Date.now();
    }
    auditLogger.logToolCall(runId, 'Google Nearby Places', { lat, lon, radius, status: 'skipped (backoff)' }, null);
    return [];
  }
  const fetchFn = getFetchFn(opts.fetch);
  const cacheKey = toKey(lat, lon, radius);
  const cached = cacheGet(cacheKey);
  if (cached) {
    auditLogger.logToolCall(runId, 'Google Nearby Places', { lat, lon, radius, status: 'cached' }, cached);
    return cached;
  }

  // Google Places API does not support multiple types in a single request
  // Issue parallel requests for each type and aggregate results
  const types = ['park', 'museum', 'tourist_attraction', 'natural_feature'];
  
  if (allowDevDebug) {
    console.log('[infer_poi] About to call Google Places for types:', types);
    console.log('[infer_poi] key loaded:', Boolean(API_KEY));
    console.log('[infer_poi] lat/lon:', lat, lon);
  }

  try {
    // Use Promise.allSettled so partial failures don't reject the entire batch
    const requests = types.map(async (type) => {
      const params = new URLSearchParams({
        location: `${lat},${lon}`,
        radius: String(radius),
        type,
        key: API_KEY,
      });
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
      
      try {
        if (allowDevDebug) {
          console.log(`[infer_poi] Fetching type: ${type}, url (redacted):`, redactUrl(url));
        }
        auditLogger.logToolCall(runId, `Google Nearby Places (${type})`, { lat, lon, radius, url: redactUrl(url) }, 'Fetching...');
        
        const res = await fetchFn(url, { method: 'GET' });
        if (!res.ok) {
          const txt = await res.text();
          logger.warn(`[POI] nearbyPlaces failed for type ${type}`, { status: res.status, body: txt });
          if (allowDevDebug) {
            console.error(`[infer_poi] Google Places error for ${type}:`, `HTTP ${res.status}`);
          }
          auditLogger.logToolCall(runId, `Google Nearby Places (${type})`, { lat, lon, radius, status: res.status }, { error: txt });
          return []; // Return empty array for this type, don't fail the entire batch
        }
        
        const json = await res.json();
        if (allowDevDebug) {
          // Verbose logging disabled - uncomment for debugging
          // console.log(`[infer_poi] raw places response for ${type}:`, JSON.stringify(json, null, 2));
        }
        
        const status = json?.status || 'OK';
        const statusIsOk = status === 'OK' || status === 'ZERO_RESULTS';
        if (!statusIsOk) {
          const errorMessage = json?.error_message || null;
          if (status === 'REQUEST_DENIED') {
            requestDeniedUntil = Date.now() + REQUEST_DENIED_BACKOFF_MS;
          }
          const key = `${status}:${errorMessage || ''}`;
          const lastLogged = statusHistory.get(key) || 0;
          if (!lastLogged || Date.now() - lastLogged >= STATUS_WARN_THROTTLE_MS) {
            statusHistory.set(key, Date.now());
            const suffix = errorMessage ? ` (${errorMessage})` : '';
            logger.warn(`[POI] Google Places API status ${status}${suffix} for type ${type}`);
            if (status === 'REQUEST_DENIED') {
              logger.warn(
                '[POI] Verify that the configured GOOGLE_MAPS_API_KEY has the Places API enabled with billing and server-side access allowed.'
              );
            }
          }
          if (allowDevDebug) {
            console.error(`[infer_poi] Google Places status error for ${type}:`, status, errorMessage || '');
          }
          return []; // Return empty array for this type
        }
        
        const results = Array.isArray(json.results) ? json.results : [];
        auditLogger.logToolCall(runId, `Google Nearby Places (${type})`, { lat, lon, radius }, { count: results.length });
        return results;
      } catch (err) {
        logger.warn(`[POI] nearbyPlaces exception for type ${type}`, err && err.message ? err.message : err);
        if (allowDevDebug) {
          console.error(`[infer_poi] Google Places error for ${type}:`, err && err.message ? err.message : err);
        }
        auditLogger.logToolCall(runId, `Google Nearby Places (${type})`, { lat, lon, radius }, { error: err.message });
        return []; // Return empty array for this type on exception
      }
    });

    const settledResults = await Promise.allSettled(requests);
    
    // Flatten all successful results
    const allResults = settledResults
      .filter(result => result.status === 'fulfilled')
      .flatMap(result => result.value);

    // Deduplicate by place_id using a Map for O(N) efficiency
    const deduplicatedMap = new Map();
    for (const r of allResults) {
      const placeId = r.place_id;
      if (placeId && !deduplicatedMap.has(placeId)) {
        deduplicatedMap.set(placeId, r);
      }
    }

    const uniqueResults = Array.from(deduplicatedMap.values());

    // Transform results into POI objects
    const pois = uniqueResults.map((r) => {
      const placeLat = r.geometry?.location?.lat;
      const placeLon = r.geometry?.location?.lng;
      const distance = (placeLat && placeLon) ? haversineDistanceMeters(lat, lon, placeLat, placeLon) : undefined;
      const categoryFromTypes = normalizeCategory(r.types || []);
      let category = categoryFromTypes;
      const name = r.name || '';
      // Name-based override: treat canal, aqueduct, walkway, path, and trail as 'trail' if not already
      // This helps surface trails and walkways even if Google Places does not type them as such
      if (
        category !== 'trail' &&
        /trail|trailhead|canal|aqueduct|greenway|walkway|path/i.test(name)
      ) {
        category = 'trail';
      }
      const address = r.vicinity || r.formatted_address || null;
      let confidence = 'low';
      if (distance !== undefined) {
        if (distance <= 120) confidence = 'high';
        else if (distance <= 300) confidence = 'medium';
      }
      return {
        id: r.place_id || `${placeLat}:${placeLon}:${name}`,
        name,
        category,
        lat: placeLat,
        lon: placeLon,
        distanceMeters: distance,
        address,
        source: 'google',
        confidence,
      };
    });
    
    cacheSet(cacheKey, pois);
    auditLogger.logToolCall(runId, 'Google Nearby Places', { lat, lon, radius, totalResults: pois.length }, pois);
    return pois;
  } catch (err) {
    logger.warn('[POI] nearbyPlaces exception', err && err.message ? err.message : err);
    if (allowDevDebug) {
      console.error('[infer_poi] Google Places error:', err && err.message ? err.message : err);
    }
    auditLogger.logToolCall(runId, 'Google Nearby Places', { lat, lon, radius }, { error: err.message });
    return [];
  }
}

module.exports = { reverseGeocode, nearbyPlaces };
