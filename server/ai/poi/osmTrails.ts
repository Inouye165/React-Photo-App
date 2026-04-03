require('../../env');

interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, ...args: unknown[]) => void;
}

interface TrailPoi {
  id: string;
  name: string | null;
  category: 'trail';
  lat: number;
  lon: number;
  distanceMeters: number;
  source: 'osm';
  tags: Record<string, string>;
}

interface CacheEntry {
  value: TrailPoi[];
  expires: number;
}

interface OverpassElement {
  type: string;
  id: number;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

const logger: Logger = require('../../logger');
const { haversineDistanceMeters } = require('./geoUtils');

// TODO: Make sure the UI displays "© OpenStreetMap contributors" when surfacing OSM trail data.
// NOTE: Attribution is currently handled in src/components/LocationMapPanel.tsx

const ensureFetch = (): typeof globalThis.fetch => {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  return async (...args: Parameters<typeof globalThis.fetch>): Promise<Response> => {
    const { default: fetchPolyfill } = await import('node-fetch');
    return (fetchPolyfill as unknown as typeof globalThis.fetch)(...args);
  };
};

const fetchFn = ensureFetch();
const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
// Default radius to search for trails (meters). Reduced to prevent excessive queries
// and to avoid surfacing trails far from the photo GPS. This is configurable via env.
const DEFAULT_OSM_RADIUS_METERS: number = Number(process.env.OSM_TRAILS_DEFAULT_RADIUS_METERS || 100);
const CACHE_TTL_MS: number = Number(process.env.OSM_CACHE_TTL_MS) || 6 * 60 * 60 * 1000; // 6 hours
const CACHE_MAX_ENTRIES: number = Number(process.env.OSM_CACHE_MAX_ENTRIES) || 100;
const cache: Map<string, CacheEntry> = new Map();

function toCacheKey(lat: number, lon: number, radius: number): string {
  const lat4 = Number(lat).toFixed(4);
  const lon4 = Number(lon).toFixed(4);
  return `${lat4}:${lon4}:${radius}`;
}

function cacheGet(key: string): TrailPoi[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key: string, value: TrailPoi[]): void {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

function buildOverpassQuery(lat: number, lon: number, radiusMeters: number): string {
  return `[out:json][timeout:25];\n(\n  way(around:${radiusMeters}, ${lat}, ${lon})[highway~"footway|path|cycleway"];\n  relation(around:${radiusMeters}, ${lat}, ${lon})[route~"hiking|foot|bicycle"];\n  way(around:${radiusMeters}, ${lat}, ${lon})[waterway=canal];\n);\nout tags center;`;
}

function normalizeElement(element: OverpassElement, lat: number, lon: number): TrailPoi | null {
  const centerLat = element?.center?.lat ?? element?.lat ?? null;
  const centerLon = element?.center?.lon ?? element?.lon ?? null;
  if (centerLat == null || centerLon == null) return null;
  const distanceMeters: number = haversineDistanceMeters(lat, lon, centerLat, centerLon);
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

async function nearbyTrailsFromOSM(lat: number, lon: number, radiusMeters: number = DEFAULT_OSM_RADIUS_METERS): Promise<TrailPoi[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const endpoint: string = process.env.OSM_OVERPASS_ENDPOINT || DEFAULT_OVERPASS_ENDPOINT;
  const cacheKey = toCacheKey(lat, lon, radiusMeters);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const query = buildOverpassQuery(lat, lon, radiusMeters);
  const body = `data=${encodeURIComponent(query)}`;
  logger.info('[OSM] Querying Overpass for trails', {
    endpoint,
    radiusMeters,
  });

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('[OSM] Overpass request error', errMsg);
    return [];
  }

  if (!response.ok) {
    let text: string | null = null;
    try {
      text = await response.text();
    } catch (err: unknown) {
      text = err instanceof Error ? err.message : null;
    }
    logger.warn('[OSM] Overpass response not OK', {
      status: response.status,
      body: text,
    } as unknown as Record<string, unknown>);
    return [];
  }

  let json: { elements?: OverpassElement[] };
  try {
    json = await response.json() as { elements?: OverpassElement[] };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('[OSM] Failed to parse Overpass response', errMsg);
    return [];
  }

  const elements: OverpassElement[] = Array.isArray(json?.elements) ? json.elements! : [];
  const pois: TrailPoi[] = elements
    .map((element: OverpassElement) => normalizeElement(element, lat, lon))
    .filter((poi): poi is TrailPoi => poi !== null)
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
    } as unknown as Record<string, unknown>);
  } else {
    logger.info('[OSM] No trails returned from Overpass query');
  }

  return pois;
}

module.exports = {
  nearbyTrailsFromOSM,
};

export { nearbyTrailsFromOSM };
