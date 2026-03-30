// Utility helpers extracted from graph.js

interface DebugUsageEntry {
  [key: string]: unknown;
}

interface GpsCoordinates {
  lat: number;
  lon: number;
}

interface UsageInfo {
  usage: Record<string, unknown> | null;
  model: string | null;
}

interface LocationIntelDefaults {
  city: string;
  region: string;
  nearest_landmark: string;
  nearest_park: string;
  nearest_trail: string;
  description_addendum: string;
  [key: string]: string;
}

interface NearbyPlace {
  name?: string;
  category?: string;
  distanceMeters?: number | null;
  [key: string]: unknown;
}

interface PoiAnalysis {
  locationIntel?: LocationIntelDefaults;
  [key: string]: unknown;
}

interface ParsedMetadata {
  description?: string;
  keywords?: string;
  [key: string]: unknown;
}

interface ExposureInfo {
  iso: number | null;
  aperture: number | null;
  shutter: string | number | null;
}

interface MetadataSummary {
  date: string | null;
  gps: string | null;
  camera: string | null;
  heading: number | null;
  altitude_meters: number | null;
  exposure: ExposureInfo;
}

interface MetadataPayload {
  directionDegrees: number | null;
  directionCardinal: string | null;
  altitudeMeters: number | null;
  [key: string]: unknown;
}

interface GraphState {
  gpsString?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

function accumulateDebugUsage(debugUsage: DebugUsageEntry[] = [], entry: DebugUsageEntry = {}): DebugUsageEntry[] {
  const next = Array.isArray(debugUsage) ? [...debugUsage] : [];
  next.push(entry);
  return next;
}

function extractUsageFromResponse(response: Record<string, unknown> | null | undefined): UsageInfo {
  try {
    const usage = (response?.usage as Record<string, unknown>) || null;
    const choices = response?.choices as Array<{ model?: string }> | undefined;
    const model = (response?.model as string) || choices?.[0]?.model || null;
    return { usage, model };
  } catch {
    return { usage: null, model: null };
  }
}

function parseGpsString(gpsString: string | null | undefined): GpsCoordinates | null {
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

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function dmsToDecimal(values: unknown[], ref: string | undefined): number | null {
  if (!Array.isArray(values) || values.length < 3) return null;
  const [deg, min, sec] = values.map(parseNumber);
  if (!Number.isFinite(deg!) || !Number.isFinite(min!) || !Number.isFinite(sec!)) return null;
  let decimal = deg! + min! / 60 + sec! / 3600;
  if (typeof ref === 'string' && ['S', 'W'].includes(ref.toUpperCase())) {
    decimal *= -1;
  }
  return decimal;
}

function resolveGpsFromMetadata(meta: Record<string, unknown> = {}): GpsCoordinates | null {
  const location = meta?.location as Record<string, unknown> | undefined;
  const GPS = meta?.GPS as Record<string, unknown> | undefined;
  const candidatePairs = [
    { lat: meta.latitude, lon: meta.longitude },
    { lat: meta.lat, lon: meta.lon },
    { lat: meta.Latitude, lon: meta.Longitude },
    { lat: location?.lat, lon: location?.lon },
    { lat: GPS?.latitude, lon: GPS?.longitude },
  ];
  for (const pair of candidatePairs) {
    if (pair && pair.lat != null && pair.lon != null) {
      const lat = parseNumber(pair.lat);
      const lon = parseNumber(pair.lon);
      if (lat != null && lon != null) return { lat, lon };
    }
  }

  if (Array.isArray(meta.GPSLatitude) && Array.isArray(meta.GPSLongitude)) {
    const lat = dmsToDecimal(meta.GPSLatitude, meta.GPSLatitudeRef as string | undefined);
    const lon = dmsToDecimal(meta.GPSLongitude, meta.GPSLongitudeRef as string | undefined);
    if (lat != null && lon != null) return { lat, lon };
  }
  return null;
}

function parseGpsCoordinates(state: GraphState | null | undefined): GpsCoordinates | null {
  return parseGpsString(state?.gpsString) || resolveGpsFromMetadata((state?.metadata || {}) as Record<string, unknown>);
}

function extractHeading(meta: Record<string, unknown> = {}): number | null {
  const GPSInfo = meta?.GPSInfo as Record<string, unknown> | undefined;
  const GPS = meta?.GPS as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    meta.heading,
    meta.Heading,
    meta.direction,
    meta.Direction,
    meta.facingDirection,
    meta.compassHeading,
    meta?.GPSImgDirection,
    meta?.GPSDirection,
    meta?.GPSDestBearing,
    GPS?.GPSImgDirection,
    GPSInfo?.GPSImgDirection,
  ];
  for (const value of candidates) {
    const num = parseNumber(value);
    if (num != null) return num;
  }
  return null;
}

function extractAltitude(meta: Record<string, unknown> = {}): number | null {
  const GPS = meta?.GPS as Record<string, unknown> | undefined;
  const GPSInfo = meta?.GPSInfo as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    meta.altitude,
    meta.Altitude,
    meta.GPSAltitude,
    GPS?.GPSAltitude,
    GPSInfo?.GPSAltitude,
  ];
  for (const value of candidates) {
    const num = parseNumber(value);
    if (num != null) return num;
  }
  return null;
}

function extractTimestamp(meta: Record<string, unknown> = {}): string | null {
  const gpsDate = typeof meta.GPSDateStamp === 'string' ? (meta.GPSDateStamp as string).trim() : null;
  let gpsTime: string | null = null;
  if (Array.isArray(meta.GPSTimeStamp)) {
    gpsTime = (meta.GPSTimeStamp as unknown[]).map((part) => String(part).padStart(2, '0')).join(':');
  } else if (typeof meta.GPSTimeStamp === 'string') {
    gpsTime = (meta.GPSTimeStamp as string).trim();
  }
  if (gpsDate && gpsTime) {
    return `${gpsDate} ${gpsTime}`;
  }

  const candidates: unknown[] = [
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

function headingToCardinal(degrees: number | null | undefined): string | null {
  if (degrees == null || !Number.isFinite(degrees)) return null;
  const normalized = ((degrees % 360) + 360) % 360;
  const directions: string[] = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(normalized / 22.5) % directions.length;
  return directions[index];
}

function buildLocationIntelDefaults(overrides: Partial<LocationIntelDefaults> = {}): LocationIntelDefaults {
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

function sanitizeIntelField(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function postProcessLocationIntel(intel: LocationIntelDefaults | null | undefined): LocationIntelDefaults | null | undefined {
  if (!intel || typeof intel !== 'object') return intel;
  const result = { ...intel };

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

function selectBestNearby(nearby: NearbyPlace[] = [], intel: Partial<LocationIntelDefaults> = {}): NearbyPlace | null {
  if (!Array.isArray(nearby)) return null;
  const priority: string[] = ['landmark', 'attraction', 'park', 'trail', 'mountain', 'river'];
  for (const category of priority) {
    const found = nearby.find((place) => (place?.category || '').toLowerCase() === category);
    if (found) return found;
  }
  if (sanitizeIntelField(intel.nearest_landmark)) {
    return {
      name: intel.nearest_landmark,
      category: 'landmark',
      distanceMeters: null,
    };
  }
  return null;
}

function enrichMetadataWithPoi(parsed: ParsedMetadata | null | undefined, poiAnalysis: PoiAnalysis | null | undefined): ParsedMetadata | null | undefined {
  if (!parsed || !poiAnalysis) return parsed;
  const intel = poiAnalysis.locationIntel || poiAnalysis;
  if (!intel) return parsed;

  const fields: Array<{ key: string; label: string }> = [
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
    const value = sanitizeIntelField((intel as Record<string, unknown>)[field.key]);
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

function metadataPayloadWithDirection(state: GraphState): MetadataPayload {
  const base = (state.metadata || {}) as Record<string, unknown>;
  const heading = extractHeading(base);
  const payload: MetadataPayload = {
    ...base,
    directionDegrees: heading,
    directionCardinal: headingToCardinal(heading),
    altitudeMeters: extractAltitude(base),
  };
  return payload;
}

function summarizeMetadataForPrompt(meta: Record<string, unknown> = {}): MetadataSummary {
  return {
    date: (meta.DateTimeOriginal as string) || (meta.dateTime as string) || null,
    gps: meta?.latitude && meta?.longitude ? `${meta.latitude},${meta.longitude}` : null,
    camera: (meta.cameraModel as string) || (meta.Make as string) || (meta.Model as string) || null,
    heading: extractHeading(meta) || null,
    altitude_meters: extractAltitude(meta) || null,
    exposure: {
      iso: parseNumber(meta.ISO) || null,
      aperture: parseNumber(meta.FNumber) || null,
      shutter: (meta.ExposureTime as string | number) || null,
    }
  };
}

function ensureRestaurantInDescription(description: string | null | undefined, restaurantName: string | null | undefined, photoLocation?: string | null, photoTimestamp?: string | null): string {
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

module.exports = {
  accumulateDebugUsage,
  extractUsageFromResponse,
  parseGpsString,
  parseNumber,
  dmsToDecimal,
  resolveGpsFromMetadata,
  extractHeading,
  extractAltitude,
  extractTimestamp,
  headingToCardinal,
  buildLocationIntelDefaults,
  sanitizeIntelField,
  postProcessLocationIntel,
  selectBestNearby,
  enrichMetadataWithPoi,
  metadataPayloadWithDirection,
  summarizeMetadataForPrompt,
  ensureRestaurantInDescription,
  parseGpsCoordinates,
};

export {
  accumulateDebugUsage,
  extractUsageFromResponse,
  parseGpsString,
  parseNumber,
  dmsToDecimal,
  resolveGpsFromMetadata,
  extractHeading,
  extractAltitude,
  extractTimestamp,
  headingToCardinal,
  buildLocationIntelDefaults,
  sanitizeIntelField,
  postProcessLocationIntel,
  selectBestNearby,
  enrichMetadataWithPoi,
  metadataPayloadWithDirection,
  summarizeMetadataForPrompt,
  ensureRestaurantInDescription,
  parseGpsCoordinates,
};