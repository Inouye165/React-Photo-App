require('../../env');

const logger = require('../../logger') as {
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
};
import { haversineDistanceMeters } from './geoUtils';

type AuditLogger = {
  logToolCall(runId: string, toolName: string, input: unknown, output: unknown): void;
};

const auditLogger = require('../langgraph/audit_logger') as AuditLogger;

type FetchFn = typeof fetch;

interface CacheEntry<T> {
  value: T;
  expires: number;
}

export interface ReverseGeocodeResult {
  address: string | null;
}

export interface POI {
  id: string;
  name: string;
  category: string;
  lat: number | undefined;
  lon: number | undefined;
  distanceMeters: number | undefined;
  address: string | null;
  source: 'google';
  confidence: 'high' | 'medium' | 'low';
}

export interface NearbyPlacesOpts {
  runId?: string;
  fetch?: FetchFn;
}

interface PlaceResult {
  place_id?: string;
  name?: string;
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number } };
  vicinity?: string;
  formatted_address?: string;
}

interface PlacesApiResponse {
  status?: string;
  error_message?: string;
  results?: PlaceResult[];
}

function ensureFetch(): FetchFn {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis) as FetchFn;
  return (async (...args: Parameters<FetchFn>): Promise<Response> => {
    const { default: fetchPolyfill } = await import('node-fetch');
    return (fetchPolyfill as unknown as FetchFn)(...args);
  }) as FetchFn;
}

function getFetchFn(customFetch?: FetchFn): FetchFn {
  if (customFetch) return customFetch;
  return ensureFetch();
}

const allowDevDebug: boolean = process.env.ALLOW_DEV_DEBUG === 'true';
const STATUS_WARN_THROTTLE_MS: number = Number(process.env.GOOGLE_PLACES_STATUS_WARN_MS) || 5 * 60 * 1000;
const REQUEST_DENIED_BACKOFF_MS: number = Number(process.env.GOOGLE_PLACES_DENIED_BACKOFF_MS) || 10 * 60 * 1000;
const statusHistory: Map<string, number> = new Map();
let requestDeniedUntil = 0;
let lastBackoffNotice = 0;

const API_KEY: string | undefined =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_API_KEY;

if (!API_KEY) {
  logger.warn('[POI] GOOGLE_MAPS_API_KEY missing; skipping POI lookups');
}

function redactUrl(url: string): string {
  if (!API_KEY) return url;
  return url.replace(API_KEY, '****');
}

const cache: Map<string, CacheEntry<unknown>> = new Map();

function cacheSet<T>(key: string, value: T, ttlMs: number = 24 * 60 * 60 * 1000): void {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function toKey(lat: number, lon: number, radius: number): string {
  return `${Number(lat).toFixed(4)}:${Number(lon).toFixed(4)}:${radius}`;
}

function normalizeCategory(types: string[] = []): string {
  const t0 = (types && types.length && types[0]) || '';
  const lowered = t0.toLowerCase();
  if (lowered.includes('park')) return 'park';
  if (['tourist_attraction', 'natural_feature'].some((x) => types.includes(x))) return 'attraction';
  if (lowered.includes('lodging')) return 'hotel';
  if (['restaurant', 'cafe', 'food', 'bar', 'fast_food'].some((x) => types.includes(x))) return 'restaurant';
  if (['store', 'supermarket', 'convenience_store'].some((x) => types.includes(x))) return 'store';
  if (/trail|trailhead/i.test(t0)) return 'trail';
  return t0 || 'unknown';
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  opts: NearbyPlacesOpts = {}
): Promise<ReverseGeocodeResult> {
  const runId = opts.runId || 'unknown-run-id';
  if (!API_KEY && !opts.fetch) {
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon, status: 'skipped (no key)' }, null);
    return { address: null };
  }

  const cacheKey = `regeocode:${toKey(lat, lon, 0)}`;
  const cached = cacheGet<ReverseGeocodeResult>(cacheKey);
  if (cached) {
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon, status: 'cached' }, cached);
    return cached;
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lon)}&key=${API_KEY}`;
  const fetchFn = getFetchFn(opts.fetch);

  try {
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon, url: redactUrl(url) }, 'Fetching...');
    const res = await fetchFn(url, { method: 'GET' });
    if (!res.ok) {
      const text = await res.text();
      logger.warn('[POI] reverseGeocode failed', { status: res.status, body: text });
      auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon, status: res.status }, { error: text });
      return { address: null };
    }

    const json = (await res.json()) as { results?: Array<{ formatted_address?: string }> };
    const addr = Array.isArray(json.results) && json.results[0] ? json.results[0].formatted_address ?? null : null;
    const out: ReverseGeocodeResult = { address: addr };
    cacheSet(cacheKey, out);
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon }, out);
    return out;
  } catch (err: unknown) {
    const error = err as Error;
    logger.warn('[POI] reverseGeocode exception', error?.message ?? err);
    auditLogger.logToolCall(runId, 'Google Reverse Geocode', { lat, lon }, { error: error?.message ?? String(err) });
    return { address: null };
  }
}

// 200 feet ~= 61 meters
export async function nearbyPlaces(
  lat: number,
  lon: number,
  radius: number = 61,
  opts: NearbyPlacesOpts = {}
): Promise<POI[]> {
  const runId = opts.runId || 'unknown-run-id';
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

  const cacheKey = toKey(lat, lon, radius);
  const cached = cacheGet<POI[]>(cacheKey);
  if (cached) {
    auditLogger.logToolCall(runId, 'Google Nearby Places', { lat, lon, radius, status: 'cached' }, cached);
    return cached;
  }

  const fetchFn = getFetchFn(opts.fetch);
  const types = ['park', 'museum', 'tourist_attraction', 'natural_feature'] as const;

  if (allowDevDebug) {
    console.log('[infer_poi] About to call Google Places for types:', types);
    console.log('[infer_poi] key loaded:', Boolean(API_KEY));
    console.log('[infer_poi] lat/lon:', lat, lon);
  }

  try {
    const requests = types.map(async (type): Promise<PlaceResult[]> => {
      const params = new URLSearchParams({
        location: `${lat},${lon}`,
        radius: String(radius),
        type,
        key: API_KEY ?? '',
      });
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;

      try {
        if (allowDevDebug) {
          console.log(`[infer_poi] Fetching type: ${type}, url (redacted):`, redactUrl(url));
        }
        auditLogger.logToolCall(
          runId,
          `Google Nearby Places (${type})`,
          { lat, lon, radius, url: redactUrl(url) },
          'Fetching...'
        );

        const res = await fetchFn(url, { method: 'GET' });
        if (!res.ok) {
          const txt = await res.text();
          logger.warn(`[POI] nearbyPlaces failed for type ${type}`, { status: res.status, body: txt });
          if (allowDevDebug) {
            console.error(`[infer_poi] Google Places error for ${type}:`, `HTTP ${res.status}`);
          }
          auditLogger.logToolCall(runId, `Google Nearby Places (${type})`, { lat, lon, radius, status: res.status }, { error: txt });
          return [];
        }

        const json = (await res.json()) as PlacesApiResponse;
        const status = json?.status || 'OK';
        const statusIsOk = status === 'OK' || status === 'ZERO_RESULTS';

        if (!statusIsOk) {
          const errorMessage = json?.error_message || null;
          if (status === 'REQUEST_DENIED') {
            requestDeniedUntil = Date.now() + REQUEST_DENIED_BACKOFF_MS;
          }
          const historyKey = `${status}:${errorMessage || ''}`;
          const lastLogged = statusHistory.get(historyKey) || 0;
          if (!lastLogged || Date.now() - lastLogged >= STATUS_WARN_THROTTLE_MS) {
            statusHistory.set(historyKey, Date.now());
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
          return [];
        }

        const results: PlaceResult[] = Array.isArray(json.results) ? json.results : [];
        auditLogger.logToolCall(runId, `Google Nearby Places (${type})`, { lat, lon, radius }, { count: results.length });
        return results;
      } catch (err: unknown) {
        const error = err as Error;
        logger.warn(`[POI] nearbyPlaces exception for type ${type}`, error?.message ?? err);
        if (allowDevDebug) {
          console.error(`[infer_poi] Google Places error for ${type}:`, error?.message ?? err);
        }
        auditLogger.logToolCall(runId, `Google Nearby Places (${type})`, { lat, lon, radius }, { error: error?.message ?? String(err) });
        return [];
      }
    });

    const settledResults = await Promise.allSettled(requests);
    const allResults: PlaceResult[] = settledResults
      .filter((result): result is PromiseFulfilledResult<PlaceResult[]> => result.status === 'fulfilled')
      .flatMap((result) => result.value);

    const deduplicatedMap: Map<string, PlaceResult> = new Map();
    for (const result of allResults) {
      const placeId = result.place_id;
      if (placeId && !deduplicatedMap.has(placeId)) {
        deduplicatedMap.set(placeId, result);
      }
    }

    const uniqueResults: PlaceResult[] = Array.from(deduplicatedMap.values());
    const pois: POI[] = uniqueResults.map((result) => {
      const placeLat = result.geometry?.location?.lat;
      const placeLon = result.geometry?.location?.lng;
      const distance =
        placeLat != null && placeLon != null
          ? haversineDistanceMeters(lat, lon, placeLat, placeLon)
          : undefined;

      let category = normalizeCategory(result.types ?? []);
      const name = result.name || '';
      if (
        category !== 'trail' &&
        /trail|trailhead|canal|aqueduct|greenway|walkway|path/i.test(name)
      ) {
        category = 'trail';
      }

      const address = (result.vicinity ?? result.formatted_address) || null;
      let confidence: POI['confidence'] = 'low';
      if (distance !== undefined) {
        if (distance <= 120) confidence = 'high';
        else if (distance <= 300) confidence = 'medium';
      }

      return {
        id: result.place_id || `${placeLat}:${placeLon}:${name}`,
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
  } catch (err: unknown) {
    const error = err as Error;
    logger.warn('[POI] nearbyPlaces exception', error?.message ?? err);
    if (allowDevDebug) {
      console.error('[infer_poi] Google Places error:', error?.message ?? err);
    }
    auditLogger.logToolCall(runId, 'Google Nearby Places', { lat, lon, radius }, { error: error?.message ?? String(err) });
    return [];
  }
}

module.exports = { reverseGeocode, nearbyPlaces };
