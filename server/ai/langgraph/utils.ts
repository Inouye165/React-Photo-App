// Utility helpers extracted from graph.js

export interface DebugUsageEntry {
  usage?: unknown;
  model?: string | null;
  [key: string]: unknown;
}

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface LocationIntel {
  city?: string;
  region?: string;
  nearest_landmark?: string;
  nearest_park?: string;
  nearest_trail?: string;
  description_addendum?: string;
  [key: string]: unknown;
}

export interface NearbyPlace {
  name: string;
  category: string;
  distanceMeters: number | null;
  [key: string]: unknown;
}

export interface ParsedMetadata {
  description?: string;
  keywords?: string;
  [key: string]: unknown;
}

export interface MetadataSummary {
  date: string | null;
  gps: string | null;
  camera: string | null;
  heading: number | null;
  altitude_meters: number | null;
  exposure: {
    iso: number | null;
    aperture: number | null;
    shutter: string | number | null;
  };
}

/** Minimal slice of the LangGraph state that this module reads. */
export interface GpsState {
  gpsString?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function accumulateDebugUsage(debugUsage: DebugUsageEntry[] = [], entry: DebugUsageEntry = {}): DebugUsageEntry[] {
  const next = Array.isArray(debugUsage) ? [...debugUsage] : [];
  next.push(entry);
  return next;
}

export function extractUsageFromResponse(response: unknown): { usage: unknown; model: string | null } {
  try {
    const r = response as Record<string, unknown> | null | undefined;
    const usage = r?.usage ?? null;
    const choices = r?.choices as Array<Record<string, unknown>> | undefined;
    const model = (r?.model as string | null | undefined) || (choices?.[0]?.model as string | null | undefined) || null;
    return { usage, model };
  } catch {
    return { usage: null, model: null };
  }
}

export function parseGpsString(gpsString: string | null | undefined): Coordinates | null {
  if (!gpsString) return null;
  const [latStr, lonStr] = String(gpsString)
    .split(',')
    .map((s) => (s || '').trim())
    .filter(Boolean);
  if (!latStr || !lonStr) return null;
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function dmsToDecimal(values: unknown, ref: unknown): number | null {
  if (!Array.isArray(values) || values.length < 3) return null;
  const [deg, min, sec] = (values as unknown[]).map(parseNumber);
  if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  let decimal = (deg as number) + (min as number) / 60 + (sec as number) / 3600;
  if (typeof ref === 'string' && ['S', 'W'].includes(ref.toUpperCase())) {
    decimal *= -1;
  }
  return decimal;
}

export function resolveGpsFromMetadata(meta: Record<string, unknown> = {}): Coordinates | null {
  const gps = meta?.GPS as Record<string, unknown> | undefined;
  const location = meta?.location as Record<string, unknown> | undefined;
  const candidatePairs = [
    { lat: meta.latitude, lon: meta.longitude },
    { lat: meta.lat, lon: meta.lon },
    { lat: meta.Latitude, lon: meta.Longitude },
    { lat: location?.lat, lon: location?.lon },
    { lat: gps?.latitude, lon: gps?.longitude },
  ];
  for (const pair of candidatePairs) {
    if (pair && pair.lat != null && pair.lon != null) {
      const lat = parseNumber(pair.lat);
      const lon = parseNumber(pair.lon);
      if (lat != null && lon != null) return { lat, lon };
    }
  }

  if (Array.isArray(meta.GPSLatitude) && Array.isArray(meta.GPSLongitude)) {
    const lat = dmsToDecimal(meta.GPSLatitude, meta.GPSLatitudeRef);
    const lon = dmsToDecimal(meta.GPSLongitude, meta.GPSLongitudeRef);
    if (lat != null && lon != null) return { lat, lon };
  }
  return null;
}

export function parseGpsCoordinates(state: GpsState): Coordinates | null {
  return parseGpsString(state?.gpsString) || resolveGpsFromMetadata((state?.metadata ?? {}) as Record<string, unknown>);
}

export function extractHeading(meta: Record<string, unknown> = {}): number | null {
  const gps = meta?.GPS as Record<string, unknown> | undefined;
  const gpsInfo = meta?.GPSInfo as Record<string, unknown> | undefined;
  const candidates = [
    meta.heading,
    meta.Heading,
    meta.direction,
    meta.Direction,
    meta.facingDirection,
    meta.compassHeading,
    meta?.GPSImgDirection,
    meta?.GPSDirection,
    meta?.GPSDestBearing,
    gps?.GPSImgDirection,
    gpsInfo?.GPSImgDirection,
  ];
  for (const value of candidates) {
    const num = parseNumber(value);
    if (num != null) return num;
  }
  return null;
}

export function extractAltitude(meta: Record<string, unknown> = {}): number | null {
  const gps = meta?.GPS as Record<string, unknown> | undefined;
  const gpsInfo = meta?.GPSInfo as Record<string, unknown> | undefined;
  const candidates = [
    meta.altitude,
    meta.Altitude,
    meta.GPSAltitude,
    gps?.GPSAltitude,
    gpsInfo?.GPSAltitude,
  ];
  for (const value of candidates) {
    const num = parseNumber(value);
    if (num != null) return num;
  }
  return null;
}

export function extractTimestamp(meta: Record<string, unknown> = {}): string | null {
  const gpsDate = typeof meta.GPSDateStamp === 'string' ? meta.GPSDateStamp.trim() : null;
  let gpsTime: string | null = null;
  if (Array.isArray(meta.GPSTimeStamp)) {
    gpsTime = (meta.GPSTimeStamp as unknown[]).map((part) => String(part).padStart(2, '0')).join(':');
  } else if (typeof meta.GPSTimeStamp === 'string') {
    gpsTime = meta.GPSTimeStamp.trim();
  }
  if (gpsDate && gpsTime) {
    return `${gpsDate} ${gpsTime}`;
  }

  const candidates = [
    meta.captureTimestamp,
    meta.captureTime,
    meta.DateTimeOriginal,
    meta.CreateDate,
    meta.DateCreated,
    meta.ModifyDate,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function headingToCardinal(degrees: number | null | undefined): string | null {
  if (degrees == null || !Number.isFinite(degrees)) return null;
  const normalized = ((degrees % 360) + 360) % 360;
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(normalized / 22.5) % directions.length;
  return directions[index];
}

export function buildLocationIntelDefaults(overrides: Partial<LocationIntel> = {}): LocationIntel {
  return {
    city: 'unknown',
    region: 'unknown',
    nearest_landmark: 'unknown',
    nearest_park: 'unknown',
    nearest_trail: 'unknown',
    description_addendum: 'No additional location insights available.',
    ...overrides,
  };
}

export function sanitizeIntelField(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export function postProcessLocationIntel(intel: LocationIntel | null | undefined): LocationIntel | null | undefined {
  if (!intel || typeof intel !== 'object') return intel;
  const result: LocationIntel = { ...intel };

  const parkUnknown =
    !sanitizeIntelField(result.nearest_park) ||
    String(result.nearest_park).trim().toLowerCase() === 'unknown';

  const landmark = sanitizeIntelField(result.nearest_landmark);

  if (parkUnknown && typeof landmark === 'string') {
    const looksLikePark =
      /\b(open space|regional park|state park|city park|preserve|recreation area|park)\b/i.test(
        landmark
      );

    if (looksLikePark) {
      result.nearest_park = landmark;
    }
  }

  return result;
}

export function selectBestNearby(nearby: NearbyPlace[] = [], intel: LocationIntel = {}): NearbyPlace | null {
  if (!Array.isArray(nearby)) return null;
  const priority = ['landmark', 'attraction', 'park', 'trail', 'mountain', 'river'];
  for (const category of priority) {
    const found = nearby.find((place) => (place?.category || '').toLowerCase() === category);
    if (found) return found;
  }
  if (sanitizeIntelField(intel.nearest_landmark)) {
    return {
      name: intel.nearest_landmark as string,
      category: 'landmark',
      distanceMeters: null,
    };
  }
  return null;
}

export function enrichMetadataWithPoi(parsed: ParsedMetadata | null, poiAnalysis: unknown): ParsedMetadata | null {
  if (!parsed || !poiAnalysis) return parsed;
  const a = poiAnalysis as Record<string, unknown>;
  const intel = (a.locationIntel ?? poiAnalysis) as LocationIntel;
  if (!intel) return parsed;

  const fields: Array<{ key: keyof LocationIntel; label: string }> = [
    { key: 'city', label: 'City' },
    { key: 'region', label: 'Region' },
    { key: 'nearest_park', label: 'Nearest park' },
    { key: 'nearest_trail', label: 'Nearest trail' },
    { key: 'nearest_landmark', label: 'Nearest landmark' },
    { key: 'description_addendum', label: 'Notes' },
  ];

  const descriptionExtras: string[] = [];
  const keywordExtras: string[] = [];

  for (const field of fields) {
    const value = sanitizeIntelField(intel[field.key]);
    if (value) {
      descriptionExtras.push(`${field.label}: ${value}`);
      keywordExtras.push(value);
    }
  }

  if (descriptionExtras.length) {
    const detail = `Location Intelligence: ${descriptionExtras.join(' | ')}`;
    parsed.description = parsed.description
      ? `${parsed.description}\n\n${detail}`
      : detail;
  }

  if (keywordExtras.length) {
    parsed.keywords = parsed.keywords
      ? `${parsed.keywords}, ${keywordExtras.join(', ')}`
      : keywordExtras.join(', ');
  }

  return parsed;
}

export function metadataPayloadWithDirection(state: GpsState): Record<string, unknown> {
  const base = (state.metadata ?? {}) as Record<string, unknown>;
  const heading = extractHeading(base);
  return {
    ...base,
    directionDegrees: heading,
    directionCardinal: headingToCardinal(heading),
    altitudeMeters: extractAltitude(base),
  };
}

export function summarizeMetadataForPrompt(meta: Record<string, unknown> = {}): MetadataSummary {
  return {
    date: (meta.DateTimeOriginal as string | null | undefined) || (meta.dateTime as string | null | undefined) || null,
    gps: meta?.latitude && meta?.longitude ? `${meta.latitude},${meta.longitude}` : null,
    camera: (meta.cameraModel as string | null | undefined) || (meta.Make as string | null | undefined) || (meta.Model as string | null | undefined) || null,
    heading: extractHeading(meta),
    altitude_meters: extractAltitude(meta),
    exposure: {
      iso: parseNumber(meta.ISO),
      aperture: parseNumber(meta.FNumber),
      shutter: (meta.ExposureTime as string | number | null | undefined) ?? null,
    },
  };
}

export function ensureRestaurantInDescription(
  description: string | null | undefined,
  restaurantName: string | null | undefined,
  photoLocation: string | null | undefined,
  photoTimestamp: string | null | undefined
): string {
  const desc = (description || '').trim();
  const name = (restaurantName || '').trim();
  if (!name) {
    return desc || '';
  }
  if (desc.toLowerCase().includes(name.toLowerCase())) {
    return desc;
  }
  const locationSuffix = photoLocation ? ` in ${photoLocation}` : '';
  const timeSuffix = photoTimestamp ? ` on ${photoTimestamp}` : '';
  if (desc) {
    return `${desc} This dish was enjoyed at ${name}${locationSuffix}${timeSuffix}.`;
  }
  return `A dish enjoyed at ${name}${locationSuffix}${timeSuffix}.`;
}
