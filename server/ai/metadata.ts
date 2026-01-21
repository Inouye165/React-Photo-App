export type MetadataRecord = Record<string, unknown>;

export type LatLon = {
  lat: number | null;
  lon: number | null;
  source: string;
};

export function normalizeDegrees(value: unknown): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(numeric)) return null;
  const normalized = ((numeric % 360) + 360) % 360;
  return normalized === 360 ? 0 : normalized;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(/,/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (Array.isArray(value) && value.length === 1) {
    return toNumber(value[0]);
  }
  if (typeof value === 'object') {
    if (value && 'numerator' in value && 'denominator' in value) {
      const numerator = toNumber((value as { numerator?: unknown }).numerator);
      const denominator = toNumber((value as { denominator?: unknown }).denominator) || 1;
      if (numerator === null) return null;
      return numerator / denominator;
    }
    if (value && 'value' in value) {
      return toNumber((value as { value?: unknown }).value);
    }
    const values = Object.values(value as Record<string, unknown>);
    if (values.length === 1) {
      return toNumber(values[0]);
    }
  }
  return null;
}

export function dmsArrayToDecimal(values: unknown, ref: unknown): number | null {
  if (!values) return null;
  const arr = Array.isArray(values) ? values : Object.values(values as Record<string, unknown>);
  if (!arr.length) return null;
  const deg = toNumber(arr[0]);
  if (deg === null) return null;
  const min = toNumber(arr[1]) || 0;
  const sec = toNumber(arr[2]) || 0;
  let decimal = deg + min / 60 + sec / 3600;
  if (ref === 'S' || ref === 'W') {
    decimal = -Math.abs(decimal);
  }
  return decimal;
}

export function extractLatLon(metaRaw: unknown): LatLon {
  const DEBUG_GPS = process.env.DEBUG_GPS === '1';
  const log = (...args: unknown[]) => {
    if (DEBUG_GPS) console.log('[GPS]', ...args);
  };
  const safeJSON = (s: string) => {
    try {
      return JSON.parse(s) as MetadataRecord;
    } catch {
      return {};
    }
  };

  const meta = typeof metaRaw === 'string' ? safeJSON(metaRaw) : (metaRaw || {}) as MetadataRecord;

  let lat = toNumber(meta.latitude);
  let lon = toNumber(meta.longitude);
  if (lat !== null && lon !== null) {
    log('using top-level latitude/longitude', lat, lon);
    return { lat, lon, source: 'top_level' };
  }

  const GPS = (meta.GPS || meta.GPSInfo || meta.gps || {}) as MetadataRecord;
  const latArr = (GPS.GPSLatitude || meta.GPSLatitude || null) as unknown;
  const lonArr = (GPS.GPSLongitude || meta.GPSLongitude || null) as unknown;
  const latRef = (GPS.GPSLatitudeRef || meta.GPSLatitudeRef || null) as unknown;
  const lonRef = (GPS.GPSLongitudeRef || meta.GPSLongitudeRef || null) as unknown;
  if (latArr && lonArr) {
    const latDec = dmsArrayToDecimal(latArr, latRef);
    const lonDec = dmsArrayToDecimal(lonArr, lonRef);
    if (latDec !== null && lonDec !== null) {
      log('using DMS arrays', { latArr, latRef, lonArr, lonRef }, '->', latDec, lonDec);
      return { lat: latDec, lon: lonDec, source: 'exif_gps_dms' };
    }
  }

  const Composite = (meta.Composite || meta.composite || {}) as MetadataRecord;
  lat = toNumber(Composite.GPSLatitude);
  lon = toNumber(Composite.GPSLongitude);
  if (lat !== null && lon !== null) {
    log('using Composite fields', lat, lon);
    return { lat, lon, source: 'composite' };
  }

  const Loc = (meta.Location || meta.location || {}) as MetadataRecord;
  lat = toNumber(Loc.lat ?? Loc.latitude);
  lon = toNumber(Loc.lon ?? Loc.lng ?? Loc.longitude);
  if (lat !== null && lon !== null) {
    log('using Location.*', lat, lon);
    return { lat, lon, source: 'location' };
  }

  const latSigned = toNumber(GPS.Latitude ?? meta.Latitude);
  const lonSigned = toNumber(GPS.Longitude ?? meta.Longitude);
  if (latSigned !== null && lonSigned !== null) {
    log('using signed Latitude/Longitude', latSigned, lonSigned);
    return { lat: latSigned, lon: lonSigned, source: 'signed_decimal' };
  }

  const nestedSources = [meta.GPS, meta.GPSInfo, meta.Location, meta.Composite, meta.composite, meta.location];
  for (const source of nestedSources) {
    if (source && typeof source === 'object' && source !== meta) {
      const nested = extractLatLon(source as MetadataRecord);
      if (nested && nested.lat !== null && nested.lon !== null) return nested;
    }
  }

  log('no GPS match for keys:', Object.keys(meta).slice(0, 30));
  return { lat: null, lon: null, source: 'none' };
}

function normalizeExifDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const str = String(value).trim();
  if (!str) return null;
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }
  const match = str.match(/^([0-9]{4})[:-]([0-9]{2})[:-]([0-9]{2})(?:[ T]([0-9]{1,2}):([0-9]{1,2})(?::([0-9]{1,2}(?:\.[0-9]+)?))?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', secondRaw = '0'] = match;
  const hourStr = hour.padStart(2, '0');
  const minuteStr = minute.padStart(2, '0');
  const secondStr = secondRaw.includes('.')
    ? Number.parseFloat(secondRaw).toFixed(2).padStart(5, '0')
    : secondRaw.padStart(2, '0');
  const iso = `${year}-${month}-${day}T${hourStr}:${minuteStr}:${secondStr}`;
  const isoParsed = Date.parse(`${iso}Z`);
  return Number.isNaN(isoParsed) ? null : new Date(isoParsed);
}

function buildGpsDate(meta: MetadataRecord): Date | null {
  if (!meta?.GPSDateStamp || typeof meta.GPSDateStamp !== 'string') return null;
  const dateStamp = meta.GPSDateStamp.trim();
  const dateMatch = dateStamp.match(/^([0-9]{4})[:-]([0-9]{2})[:-]([0-9]{2})$/);
  if (!dateMatch) return null;
  let hours = '00';
  let minutes = '00';
  let seconds = '00';
  if (Array.isArray(meta.GPSTimeStamp)) {
    const [h = 0, m = 0, s = 0] = meta.GPSTimeStamp as unknown[];
    const hNum = toNumber(h) ?? 0;
    const mNum = toNumber(m) ?? 0;
    const sNum = toNumber(s);
    hours = String(Math.floor(hNum)).padStart(2, '0');
    minutes = String(Math.floor(mNum)).padStart(2, '0');
    if (sNum === null) {
      seconds = '00';
    } else if (Number.isInteger(sNum)) {
      seconds = String(sNum).padStart(2, '0');
    } else {
      seconds = sNum.toFixed(2);
    }
  } else if (meta.GPSTimeStamp) {
    const parts = String(meta.GPSTimeStamp).split(':');
    hours = (parts[0] || '0').padStart(2, '0');
    minutes = (parts[1] || '0').padStart(2, '0');
    seconds = (parts[2] || '0').padStart(2, '0');
  }
  const iso = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${hours}:${minutes}:${seconds}`;
  const parsed = Date.parse(`${iso}Z`);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function getBestCaptureDate(meta: MetadataRecord): Date | null {
  if (!meta || typeof meta !== 'object') return null;
  const candidates = [
    meta.DateTimeOriginal,
    meta.DateTimeDigitized,
    meta.CreateDate,
    meta.ModifyDate,
    meta.CaptureDate,
    meta.DateCreated,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeExifDate(candidate);
    if (normalized) return normalized;
  }
  return buildGpsDate(meta);
}

function degreesToCardinal(degrees: number | null): string | null {
  const normalized = normalizeDegrees(degrees);
  if (normalized === null) return null;
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(normalized / 22.5) % directions.length;
  return directions[index];
}

function getDirectionDegrees(meta: MetadataRecord): number | null {
  if (!meta || typeof meta !== 'object') return null;
  const candidates = [
    meta.GPSImgDirection,
    meta.GPSDestBearing,
    meta.GPSDirection,
    meta.CameraYawDegree,
    meta.CameraYaw,
    meta.GimbalYawDegree,
    meta.Yaw,
    (meta.CompassHeading as { TrueHeading?: unknown } | undefined)?.TrueHeading,
    (meta.CompassHeading as { MagneticHeading?: unknown } | undefined)?.MagneticHeading,
    (meta.GPS as MetadataRecord | undefined)?.GPSImgDirection,
    (meta.GPS as MetadataRecord | undefined)?.GPSDirection,
    (meta.GPS as MetadataRecord | undefined)?.DestBearing,
    (meta.GPSInfo as MetadataRecord | undefined)?.GPSImgDirection,
    (meta.GPSInfo as MetadataRecord | undefined)?.GPSDirection,
  ];
  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (value !== null) {
      const normalized = normalizeDegrees(value);
      if (normalized !== null) return normalized;
    }
  }
  return null;
}

function getAltitudeMeters(meta: MetadataRecord): number | null {
  if (!meta || typeof meta !== 'object') return null;
  const candidates = [
    meta.GPSAltitude,
    meta.RelativeAltitude,
    meta.GimbalAltitudeDegree,
    meta.GPSElevation,
    meta.Altitude,
  ];
  for (const candidate of candidates) {
    const value = toNumber(candidate);
    if (value !== null) {
      const ref = toNumber(meta.GPSAltitudeRef);
      if (ref === 1) {
        return -Math.abs(value);
      }
      return value;
    }
  }
  return null;
}

function formatFacingDirectionKeyword(directionDegrees: number | null): string | null {
  const normalized = normalizeDegrees(directionDegrees);
  if (normalized === null) return null;
  const tolerance = 11.25;
  const mapping = [
    { angle: 0, label: 'North' },
    { angle: 22.5, label: 'North-Northeast' },
    { angle: 45, label: 'Northeast' },
    { angle: 67.5, label: 'East-Northeast' },
    { angle: 90, label: 'East' },
    { angle: 112.5, label: 'East-Southeast' },
    { angle: 135, label: 'Southeast' },
    { angle: 157.5, label: 'South-Southeast' },
    { angle: 180, label: 'South' },
    { angle: 202.5, label: 'South-Southwest' },
    { angle: 225, label: 'Southwest' },
    { angle: 247.5, label: 'West-Southwest' },
    { angle: 270, label: 'West' },
    { angle: 292.5, label: 'West-Northwest' },
    { angle: 315, label: 'Northwest' },
    { angle: 337.5, label: 'North-Northwest' },
  ];
  let best: { angle: number; label: string } | null = null;
  let bestDiff = Infinity;
  for (const item of mapping) {
    const directDiff = Math.abs(normalized - item.angle);
    const diff = Math.min(directDiff, 360 - directDiff);
    if (diff <= tolerance && diff < bestDiff) {
      best = item;
      bestDiff = diff;
    }
  }
  const degreeStr = normalized.toFixed(2).replace(/\.0+$/, '').replace(/\.$/, '');
  if (!best) {
    return `facing bearing (${degreeStr}°)`;
  }
  return `facing ${best.label} (${degreeStr}°)`;
}

export function buildMetadataKeywordParts(meta: MetadataRecord, coordsOverride?: LatLon | null): string[] {
  const parts: string[] = [];
  const captureDate = getBestCaptureDate(meta);
  if (captureDate) {
    const iso = captureDate.toISOString();
    parts.push(`date:${iso.slice(0, 10)}`);
    parts.push(`time:${iso.slice(11, 19)}Z`);
  } else {
    parts.push('date:unknown');
    parts.push('time:unknown');
  }

  const direction = getDirectionDegrees(meta);
  if (direction !== null) {
    const normalized = normalizeDegrees(direction);
    const directionStr = normalized === null ? 'unknown' : normalized.toFixed(1).replace(/\.0$/, '');
    const cardinal = normalized === null ? null : degreesToCardinal(normalized);
    parts.push(cardinal ? `direction:${cardinal} (${directionStr}°)` : `direction:${directionStr}°`);
    const facingKeyword = normalized === null ? null : formatFacingDirectionKeyword(normalized);
    if (facingKeyword) {
      parts.push(facingKeyword);
    }
  } else {
    parts.push('direction:unknown');
  }

  let coords = coordsOverride || null;
  if (!coords) {
    coords = extractLatLon(meta);
  }
  if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
    const latStr = coords.lat.toFixed(6);
    const lonStr = coords.lon.toFixed(6);
    parts.push(`gps:${latStr},${lonStr}`);
  } else {
    parts.push('gps:unknown');
  }

  const altitude = getAltitudeMeters(meta);
  if (altitude !== null) {
    const altitudeStr = altitude.toFixed(1).replace(/\.0$/, '');
    parts.push(`altitude:${altitudeStr}m`);
  } else {
    parts.push('altitude:unknown');
  }

  return parts;
}

export function mergeKeywordStrings(existing: unknown, additions: string[]): string {
  const baseKeywords = typeof existing === 'string'
    ? existing.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
  const seen = new Set(baseKeywords.map((item) => item.toLowerCase()));
  const result = [...baseKeywords];
  for (const addition of additions) {
    const trimmed = (addition || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      result.push(trimmed);
      seen.add(key);
    }
  }
  return result.join(', ');
}
