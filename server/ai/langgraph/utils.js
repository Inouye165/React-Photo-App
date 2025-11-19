// Utility helpers extracted from graph.js

function accumulateDebugUsage(debugUsage = [], entry = {}) {
  const next = Array.isArray(debugUsage) ? [...debugUsage] : [];
  next.push(entry);
  return next;
}

function extractUsageFromResponse(response) {
  try {
    const usage = response?.usage || null;
    const model = response?.model || response?.choices?.[0]?.model || null;
    return { usage, model };
  } catch {
    return { usage: null, model: null };
  }
}

function parseGpsString(gpsString) {
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

function parseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function dmsToDecimal(values, ref) {
  if (!Array.isArray(values) || values.length < 3) return null;
  const [deg, min, sec] = values.map(parseNumber);
  if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  let decimal = deg + min / 60 + sec / 3600;
  if (typeof ref === 'string' && ['S', 'W'].includes(ref.toUpperCase())) {
    decimal *= -1;
  }
  return decimal;
}

function resolveGpsFromMetadata(meta = {}) {
  const candidatePairs = [
    { lat: meta.latitude, lon: meta.longitude },
    { lat: meta.lat, lon: meta.lon },
    { lat: meta.Latitude, lon: meta.Longitude },
    { lat: meta?.location?.lat, lon: meta?.location?.lon },
    { lat: meta?.GPS?.latitude, lon: meta?.GPS?.longitude },
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

function parseGpsCoordinates(state) {
  return parseGpsString(state?.gpsString) || resolveGpsFromMetadata(state?.metadata || {});
}

function extractHeading(meta = {}) {
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
    meta?.GPS?.GPSImgDirection,
    meta?.GPSInfo?.GPSImgDirection,
  ];
  for (const value of candidates) {
    const num = parseNumber(value);
    if (num != null) return num;
  }
  return null;
}

function extractAltitude(meta = {}) {
  const candidates = [
    meta.altitude,
    meta.Altitude,
    meta.GPSAltitude,
    meta?.GPS?.GPSAltitude,
    meta?.GPSInfo?.GPSAltitude,
  ];
  for (const value of candidates) {
    const num = parseNumber(value);
    if (num != null) return num;
  }
  return null;
}

function extractTimestamp(meta = {}) {
  const gpsDate = typeof meta.GPSDateStamp === 'string' ? meta.GPSDateStamp.trim() : null;
  let gpsTime = null;
  if (Array.isArray(meta.GPSTimeStamp)) {
    gpsTime = meta.GPSTimeStamp.map((part) => String(part).padStart(2, '0')).join(':');
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

function headingToCardinal(degrees) {
  if (degrees == null || !Number.isFinite(degrees)) return null;
  const normalized = ((degrees % 360) + 360) % 360;
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(normalized / 22.5) % directions.length;
  return directions[index];
}

function buildLocationIntelDefaults(overrides = {}) {
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

function sanitizeIntelField(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function postProcessLocationIntel(intel) {
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

function selectBestNearby(nearby = [], intel = {}) {
  if (!Array.isArray(nearby)) return null;
  const priority = ['landmark', 'attraction', 'park', 'trail', 'mountain', 'river'];
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

function enrichMetadataWithPoi(parsed, poiAnalysis) {
  if (!parsed || !poiAnalysis) return parsed;
  const intel = poiAnalysis.locationIntel || poiAnalysis;
  if (!intel) return parsed;

  const fields = [
    { key: 'city', label: 'City' },
    { key: 'region', label: 'Region' },
    { key: 'nearest_park', label: 'Nearest park' },
    { key: 'nearest_trail', label: 'Nearest trail' },
    { key: 'nearest_landmark', label: 'Nearest landmark' },
    { key: 'description_addendum', label: 'Notes' },
  ];

  const descriptionExtras = [];
  const keywordExtras = [];

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

function metadataPayloadWithDirection(state) {
  const base = state.metadata || {};
  const heading = extractHeading(base);
  const payload = {
    ...base,
    directionDegrees: heading,
    directionCardinal: headingToCardinal(heading),
    altitudeMeters: extractAltitude(base),
  };
  return payload;
}

function summarizeMetadataForPrompt(meta = {}) {
  return {
    date: meta.DateTimeOriginal || meta.dateTime || null,
    gps: meta?.latitude && meta?.longitude ? `${meta.latitude},${meta.longitude}` : null,
    camera: meta.cameraModel || meta.Make || meta.Model || null,
    heading: extractHeading(meta) || null,
    altitude_meters: extractAltitude(meta) || null,
    exposure: {
      iso: parseNumber(meta.ISO) || null,
      aperture: parseNumber(meta.FNumber) || null,
      shutter: meta.ExposureTime || null,
    }
  };
}

function ensureRestaurantInDescription(description, restaurantName, photoLocation, photoTimestamp) {
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