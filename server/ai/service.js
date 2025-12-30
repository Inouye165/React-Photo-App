const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('../env');
const logger = require('../logger');
const auditLogger = require('./langgraph/audit_logger');
const allowDevDebug = process.env.ALLOW_DEV_DEBUG === 'true';

// Fail-fast if OpenAI API key is missing — check at module load time
// Allow tests to run without an API key by skipping the throw when
// running under the test environment. This keeps the strict check
// for development/production while making CI/tests less brittle.
if (!process.env.OPENAI_API_KEY) {
  if (process.env.NODE_ENV === 'test') {
    // In test environment, don't fail-fast. Tests should mock agents
    // or provide a test key via test setup.
    logger.warn('OPENAI_API_KEY not set — skipping fail-fast in test environment.');
  } else {
    throw new Error('OPENAI_API_KEY not set in .env');
  }
}


// Native OpenAI client (singleton)
const openai = require('./openaiClient');
const { convertHeicToJpegBuffer } = require('../media/image');
const sharp = require('sharp');
const exifr = require('exifr');

// Hard limit for AI processing file size (20 MB)
const supabase = require('../lib/supabaseClient');

function normalizeDegrees(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const normalized = ((value % 360) + 360) % 360;
  return normalized === 360 ? 0 : normalized;
}

function toNumber(value) {
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
    if ('numerator' in value && 'denominator' in value) {
      const numerator = toNumber(value.numerator);
      const denominator = toNumber(value.denominator) || 1;
      if (numerator === null) return null;
      return numerator / denominator;
    }
    if ('value' in value) {
      return toNumber(value.value);
    }
    const values = Object.values(value);
    if (values.length === 1) {
      return toNumber(values[0]);
    }
  }
  return null;
}

function dmsArrayToDecimal(values, ref) {
  if (!values) return null;
  const arr = Array.isArray(values) ? values : Object.values(values);
  if (!arr.length) return null;
  const deg = toNumber(arr[0]);
  if (deg === null) return null;
  const min = toNumber(arr[1]) || 0;
  const sec = toNumber(arr[2]) || 0;
  let decimal = deg + (min / 60) + (sec / 3600);
  if (ref === 'S' || ref === 'W') {
    decimal = -Math.abs(decimal);
  }
  return decimal;
}
// Improved extractor: returns { lat, lon, source }
function extractLatLon(metaRaw) {
  const DEBUG_GPS = process.env.DEBUG_GPS === '1';
  function log(...args) { if (DEBUG_GPS) console.log('[GPS]', ...args); }
  function safeJSON(s) { try { return JSON.parse(s); } catch { return {}; } }

  const meta = (typeof metaRaw === 'string') ? safeJSON(metaRaw) : (metaRaw || {});

  // 1) Common exifr top-level numeric lat/lon
  let lat = toNumber(meta.latitude);
  let lon = toNumber(meta.longitude);
  if (lat !== null && lon !== null) {
    log('using top-level latitude/longitude', lat, lon);
    return { lat, lon, source: 'top_level' };
  }

  // 2) GPS DMS arrays (common)
  const GPS = meta.GPS || meta.GPSInfo || meta.gps || {};
  const latArr = GPS.GPSLatitude || meta.GPSLatitude || null;
  const lonArr = GPS.GPSLongitude || meta.GPSLongitude || null;
  const latRef = GPS.GPSLatitudeRef || meta.GPSLatitudeRef || null;
  const lonRef = GPS.GPSLongitudeRef || meta.GPSLongitudeRef || null;
  if (latArr && lonArr) {
    const latDec = dmsArrayToDecimal(latArr, latRef);
    const lonDec = dmsArrayToDecimal(lonArr, lonRef);
    if (latDec !== null && lonDec !== null) {
      log('using DMS arrays', { latArr, latRef, lonArr, lonRef }, '->', latDec, lonDec);
      return { lat: latDec, lon: lonDec, source: 'exif_gps_dms' };
    }
  }

  // 3) Composite-style decimal fields
  const Composite = meta.Composite || meta.composite || {};
  lat = toNumber(Composite.GPSLatitude);
  lon = toNumber(Composite.GPSLongitude);
  if (lat !== null && lon !== null) {
    log('using Composite fields', lat, lon);
    return { lat, lon, source: 'composite' };
  }

  // 4) Location object with lat/lon or lat/lng
  const Loc = meta.Location || meta.location || {};
  lat = toNumber(Loc.lat ?? Loc.latitude);
  lon = toNumber(Loc.lon ?? Loc.lng ?? Loc.longitude);
  if (lat !== null && lon !== null) {
    log('using Location.*', lat, lon);
    return { lat, lon, source: 'location' };
  }

  // 5) Signed decimal aliases
  const latSigned = toNumber(GPS.Latitude || meta.Latitude);
  const lonSigned = toNumber(GPS.Longitude || meta.Longitude);
  if (latSigned !== null && lonSigned !== null) {
    log('using signed Latitude/Longitude', latSigned, lonSigned);
    return { lat: latSigned, lon: lonSigned, source: 'signed_decimal' };
  }

  // 6) Recurse into nested sources to catch odd shapes
  const nestedSources = [meta.GPS, meta.GPSInfo, meta.Location, meta.Composite, meta.composite, meta.location];
  for (const source of nestedSources) {
    if (source && typeof source === 'object' && source !== meta) {
      const nested = extractLatLon(source);
      if (nested && nested.lat !== null && nested.lon !== null) return nested;
    }
  }

  log('no GPS match for keys:', Object.keys(meta).slice(0, 30));
  return { lat: null, lon: null, source: 'none' };
}

function normalizeExifDate(value) {
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

function buildGpsDate(meta) {
  if (!meta || !meta.GPSDateStamp) return null;
  const dateStamp = String(meta.GPSDateStamp).trim();
  const dateMatch = dateStamp.match(/^([0-9]{44})[:-]([0-9]{2})[:-]([0-9]{2})$/);
  if (!dateMatch) return null;
  let hours = '00';
  let minutes = '00';
  let seconds = '00';
  if (Array.isArray(meta.GPSTimeStamp)) {
    const [h = 0, m = 0, s = 0] = meta.GPSTimeStamp;
    const hNum = toNumber(h) || 0;
    const mNum = toNumber(m) || 0;
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

function getBestCaptureDate(meta) {
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

function degreesToCardinal(degrees) {
  const normalized = normalizeDegrees(degrees);
  if (normalized === null) return null;
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(normalized / 22.5) % directions.length;
  return directions[index];
}

function getDirectionDegrees(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const candidates = [
    meta.GPSImgDirection,
    meta.GPSDestBearing,
    meta.GPSDirection,
    meta.CameraYawDegree,
    meta.CameraYaw,
    meta.GimbalYawDegree,
    meta.Yaw,
    meta.CompassHeading && meta.CompassHeading.TrueHeading,
    meta.CompassHeading && meta.CompassHeading.MagneticHeading,
    meta.GPS && meta.GPS.GPSImgDirection,
    meta.GPS && meta.GPS.GPSDirection,
    meta.GPS && meta.GPS.DestBearing,
    meta.GPSInfo && meta.GPSInfo.GPSImgDirection,
    meta.GPSInfo && meta.GPSInfo.GPSDirection,
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

function getAltitudeMeters(meta) {
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

function formatFacingDirectionKeyword(directionDegrees) {
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
    { angle: 270, 'label': 'West' },
    { angle: 292.5, label: 'West-Northwest' },
    { angle: 315, label: 'Northwest' },
    { angle: 337.5, label: 'North-Northwest' },
  ];
  let best = null;
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

function buildMetadataKeywordParts(meta, coordsOverride) {
  const parts = [];
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
    const directionStr = normalized.toFixed(1).replace(/\.0$/, '');
    const cardinal = degreesToCardinal(normalized);
    parts.push(cardinal ? `direction:${cardinal} (${directionStr}°)` : `direction:${directionStr}°`);
    const facingKeyword = formatFacingDirectionKeyword(normalized);
    if (facingKeyword) {
      parts.push(facingKeyword);
    }
  } else {
    parts.push('direction:unknown');
  }

  let coords = coordsOverride;
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

function mergeKeywordStrings(existing, additions) {
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



const { app: aiGraph } = require('./langgraph/graph');
const { AnalysisResultSchema } = require('./schemas');


/**
 * Generate caption, description and keywords for a photo using the LangGraph workflow.
 *
 * @param {Object} options - The processing options.
 * @param {Buffer} options.fileBuffer - Raw image bytes (Buffer).
 * @param {string} options.filename - The filename (used to infer mime/extension).
 * @param {Object|string} [options.metadata] - EXIF/metadata associated with the image. May be a stringified JSON.
 * @param {string} [options.gps] - Precomputed GPS string (lat,lon) or empty string.
 * @param {string} [options.device] - Device make/model string.
 * @param {boolean} [options.isRecheck=false] - Whether this is a recheck of existing photo.
 * @returns {Promise<Object>} Resolves with an object: { caption, description, keywords }.
 * @throws Error when the workflow returns an error or omits the final result payload.
 */
async function processPhotoAI({ fileBuffer, filename, metadata, gps, device, isRecheck = false }, modelOverrides = {}) {
  let imageBuffer;
  let imageMime;
  const ext = path.extname(filename).toLowerCase();
  logger.debug(`[AI Debug] [processPhotoAI] Starting for filename: ${filename}`);
  if (ext === '.heic' || ext === '.heif') {
    imageBuffer = await convertHeicToJpegBuffer(fileBuffer, 95);
    imageMime = 'image/jpeg';
    if (allowDevDebug && process.env.NODE_ENV !== 'production') {
      try {
        const os = require('os');
        const debugDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-app-ai-debug-'));
        const debugPath = path.join(debugDir, `${crypto.randomUUID()}.jpg`);
        const fd = fs.openSync(debugPath, 'wx', 0o600);
        try {
          fs.writeFileSync(fd, imageBuffer);
        } finally {
          try { fs.closeSync(fd); } catch { /* ignore */ }
        }
        logger.debug(`[Graph Debug] Saved intermediate JPEG buffer to ${debugPath}`);
      } catch (e) {
        logger.error(`[Graph Debug] Failed to write debug image: ${e.message}`);
      }
    }
  } else {
    imageBuffer = fileBuffer;
    imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
  }
  const imageBase64 = imageBuffer.toString('base64');
  logger.debug('[Graph] Prepared image buffer for graph invocation', { filename, imageMime });
  logger.debug(`[Graph Debug] imageMime before graph: ${imageMime}`);
  logger.debug('[AI Debug] [processPhotoAI] Prepared graph invocation', {
    filename,
    imageMime,
    imageBase64Length: imageBase64.length,
    hasMetadata: Boolean(metadata && (typeof metadata === 'string' ? metadata.trim().length : Object.keys(metadata || {}).length)),
    hasGps: Boolean(gps),
    hasDevice: Boolean(device),
    modelOverrideKeys: Object.keys(modelOverrides || {})
  });

  let meta = {};
  if (typeof metadata === 'string') {
    try {
      meta = JSON.parse(metadata);
    } catch (parseErr) {
      logger.warn('[AI] Failed to parse metadata string; using empty metadata.', parseErr.message || parseErr);
      meta = {};
    }
  } else if (metadata && typeof metadata === 'object') {
    meta = metadata;
  }

  // >>> ADDED: normalize metadata fields the LLM expects (dateTime, cameraModel)
  const captureDate = getBestCaptureDate(meta);
  const deviceModel =
    (meta.Make && meta.Model) ? `${meta.Make} ${meta.Model}` :
    (meta.Model || meta.Make || null);

  const normalizedForLLM = {
    ...meta,
    dateTime: captureDate ? captureDate.toISOString() : null,
    cameraModel: deviceModel || null,
  };
  // <<< ADDED

  const runId = crypto.randomUUID();
  const initialState = {
    runId,
    filename,
    fileBuffer,
    imageBase64,
    imageMime,
    metadata: normalizedForLLM,   // <<< ADDED (was: meta)
    gpsString: gps || null,
    device: device || null,
    modelOverrides: modelOverrides || {},
    classification: null,
    poiAnalysis: null,
    rich_search_context: null,
    finalResult: null,
    error: null,
  };

  // >>> ADDED: helpful diagnostics to verify what the model receives
  logger.debug('[Graph] metadata sent to LLM (keys):', Object.keys(normalizedForLLM));
  logger.debug('[Graph] dateTime sent:', normalizedForLLM.dateTime, 'cameraModel:', normalizedForLLM.cameraModel);
  logger.info('[GPS] pre-graph gpsString = %s', initialState.gpsString);
  // <<< ADDED

  // Log initial sanitized state for the graph invocation to aid debugging/observability.
  try {
  const sanitizedInitial = { ...initialState };
  // Remove binary or large fields
  if (sanitizedInitial.fileBuffer) sanitizedInitial.fileBuffer = `[Buffer length: ${sanitizedInitial.fileBuffer.length || 'unknown'}]`;
  if (sanitizedInitial.imageBase64) sanitizedInitial.imageBase64 = '[omitted]';
  // Keep logs concise: print keys and a few summary fields instead of full metadata
  logger.info('[Graph] Initial state for %s: keys=%s classification=%s gps=%s', filename || '<unknown>', Object.keys(sanitizedInitial).join(','), sanitizedInitial.classification || '<none>', sanitizedInitial.gpsString || '<none>');
  const runType = isRecheck ? 'Recheck' : 'Standard';
  auditLogger.logGraphStart(runId, sanitizedInitial, runType);
  } catch (err) {
    logger.warn('[Graph] Failed to log initial state for %s', filename, err && err.message ? err.message : err);
  }

  logger.info(`[Graph] Invoking graph for ${filename}...`);
  let finalState;
  try {
    finalState = await aiGraph.invoke(initialState);
    auditLogger.logGraphEnd(runId, finalState);
  } catch (graphError) {
    auditLogger.logError(runId, 'Graph Invocation', graphError);
    throw graphError;
  }
  logger.debug('[AI Debug] [processPhotoAI] aiGraph.invoke returned', {
    hasFinalResult: Boolean(finalState && finalState.finalResult),
    classificationType: finalState && finalState.classification ? finalState.classification.type || null : null,
    error: finalState && finalState.error ? String(finalState.error).slice(0, 200) : null
  });
    try {
    const sanitizedFinal = { ...finalState };
    if (sanitizedFinal.fileBuffer) sanitizedFinal.fileBuffer = `[Buffer length: ${sanitizedFinal.fileBuffer.length || 'unknown'}]`;
    if (sanitizedFinal.imageBase64) sanitizedFinal.imageBase64 = '[omitted]';
    // Keep final state logs compact: only summary fields and counts.
    const poiSummary = {
      nearbyPlaces: (sanitizedFinal.poiCache?.nearbyPlaces || []).length,
      nearbyFood: (sanitizedFinal.poiCache?.nearbyFood || []).length,
      osmTrails: (sanitizedFinal.poiCache?.osmTrails || []).length,
    };
    const finalSummary = {
      classification: sanitizedFinal.classification || null,
      hasFinalResult: Boolean(sanitizedFinal.finalResult),
      finalKeys: sanitizedFinal.finalResult ? Object.keys(sanitizedFinal.finalResult) : [],
      poiSummary,
    };
    if (allowDevDebug) {
      logger.info('[Graph] Final summary for %s: %s', filename || '<unknown>', JSON.stringify(finalSummary));
    } else {
      logger.debug('[Graph] Final summary for %s: %s', filename || '<unknown>', JSON.stringify(finalSummary));
    }
  } catch (err) {
    logger.warn('[Graph] Failed to log final state for %s', filename, err && err.message ? err.message : err);
  }

  if (finalState.error) {
    logger.error(`[AI Debug] [processPhotoAI] aiGraph.invoke error: ${finalState.error}`);
    throw new Error(`AI Graph processing failed: ${finalState.error}`);
  }
  if (!finalState.finalResult) {
    logger.error('[AI Debug] [processPhotoAI] aiGraph.invoke finished but produced no finalResult.');
    throw new Error('AI Graph finished but produced no finalResult.');
  }

  const rawResult = {
    ...finalState.finalResult,
    classification: finalState.classification,
    poiAnalysis: finalState.poiAnalysis,
    collectibleInsights: finalState.collectibleInsights
  };

  // Validate with Zod
  const validation = AnalysisResultSchema.safeParse(rawResult);
  if (!validation.success) {
    logger.error('[AI Validation] Schema validation failed', {
      errors: validation.error.format(),
      rawResult: JSON.stringify(rawResult).slice(0, 1000) // Log truncated raw result
    });
    // Throwing error here will be caught by updatePhotoAIMetadata, which increments retry count
    throw new Error(`AI Validation Failed: ${validation.error.message}`);
  }

  const result = validation.data;

  logger.info('[AI Result] caption:', result.caption);
  logger.info('[AI Result] description (truncated):', (result.description || '').slice(0, 300));
  logger.info('[AI Result] keywords:', result.keywords);

  return result;
}

/**
 * Update AI metadata (caption, description, keywords, poi_analysis) for a
 * photo row in the database.
 *
 * This function will:
 * - Attempt to download the photo bytes from Supabase storage using the
 * provided storagePath.
 * - Call processPhotoAI to obtain AI-generated metadata.
 * - Update the photo row with results, manage ai_retry_count and provide
 * fallbacks when AI does not return expected fields.
 *
 * @param {Object} db - Knex database instance (must support .from/.where/.update/.first).
 * @param {Object} photoRow - Database row object for the photo (must include id, filename, metadata, ai_retry_count).
 * @param {string} storagePath - Path in Supabase storage bucket to download the file from.
 * @returns {Promise<Object|null>} Returns the AI result object on success, or null when processing failed or retried.
 * @throws Will re-throw unexpected errors only in rare cases; normally returns null on recoverable failures.
 */
async function updatePhotoAIMetadata(db, photoRow, storagePath, modelOverrides = {}) {
  try {
    logger.debug('[AI Debug] [updatePhotoAIMetadata] Called with', {
      photoId: photoRow.id,
      filename: photoRow.filename,
      storagePath,
      modelOverrideKeys: Object.keys(modelOverrides || {})
    });
    const meta = JSON.parse(photoRow.metadata || '{}');
    logger.debug('[AI Debug] [updatePhotoAIMetadata] Parsed metadata keys', Object.keys(meta));


    const coords = extractLatLon(meta);
    let gps = '';
    if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
      gps = `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}`;
      if (process.env.DEBUG_GPS === '1') {
        logger.info('[GPS] set gpsString from %s → %s', coords.source, gps);
      }
    } else {
      if (process.env.DEBUG_GPS === '1') {
        logger.info('[GPS] no coords extracted (source=%s)', coords && coords.source);
      }
    }
    if (process.env.DEBUG_GPS === '1') {
      logger.info('[GPS] DB metadata GPS fields', {
        latitude: meta.latitude,
        longitude: meta.longitude,
        GPSLatitude: meta.GPSLatitude,
        GPSLongitude: meta.GPSLongitude,
        GPSLatitudeRef: meta.GPSLatitudeRef,
        GPSLongitudeRef: meta.GPSLongitudeRef,
        nestedKeys: Object.keys(meta.GPS || meta.GPSInfo || {}).slice(0, 20)
      });
    }
    
    let device = meta.Make && meta.Model ? `${meta.Make} ${meta.Model}` : '';
    const retryCount = photoRow.ai_retry_count || 0;
    if (retryCount >= 5) {
      logger.error(`AI processing failed permanently for ${photoRow.filename} after ${retryCount} retries`);
      await db('photos').where({ id: photoRow.id }).update({
        caption: 'AI processing failed',
        description: 'AI processing failed',
        keywords: '',
        ai_retry_count: retryCount,
        poi_analysis: null
      });
      logger.debug('[AI Debug] [updatePhotoAIMetadata] Marked as permanently failed in DB.');
      return null;
    }
    
    let ai;
    let enrichedMeta;
    try {
      // Stream and resize file from Supabase Storage to avoid OOM
      logger.debug('[AI Debug] [updatePhotoAIMetadata] Creating signed URL for streaming:', storagePath);
      
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('photos')
        .createSignedUrl(storagePath, 60);
        
      if (signedUrlError) {
         throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
      }

      logger.debug('[AI Debug] [updatePhotoAIMetadata] Fetching stream from signed URL...');
      const response = await fetch(signedUrlData.signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file stream: ${response.status} ${response.statusText}`);
      }

      // Download the original file buffer first for metadata extraction
      const arrayBuffer = await response.arrayBuffer();
      const originalBuffer = Buffer.from(arrayBuffer);
      
      // Extract metadata from original file before any processing
      let richMetadata = null;
      
      try {
        logger.debug('[AI Debug] [updatePhotoAIMetadata] Extracting metadata from original buffer...');
        const exif = await exifr.parse(originalBuffer, {
          tiff: true,
          ifd0: true,
          exif: true,
          gps: true,
          xmp: true,
          icc: true,
          iptc: true,
          translateKeys: true,
          translateValues: true
        });

        if (exif && typeof exif === 'object') {
          const latRaw = exif.GPSLatitude ?? exif.latitude;
          const lonRaw = exif.GPSLongitude ?? exif.longitude;
          const lat = dmsArrayToDecimal(latRaw, exif.GPSLatitudeRef);
          const lon = dmsArrayToDecimal(lonRaw, exif.GPSLongitudeRef);

          richMetadata = {
            created_at: exif.DateTimeOriginal || exif.CreateDate || exif.DateCreated || exif.DateTimeDigitized || exif.ModifyDate || null,
            gps: (typeof lat === 'number' && typeof lon === 'number') ? {
              lat,
              lon,
              alt: toNumber(exif.GPSAltitude),
              direction: normalizeDegrees(toNumber(exif.GPSImgDirection ?? exif.GPSDestBearing))
            } : null,
            device: {
              make: exif.Make || null,
              model: exif.Model || null,
              lens: exif.LensModel || exif.Lens || null
            },
            exposure: {
              iso: toNumber(exif.ISO),
              f_stop: toNumber(exif.FNumber),
              shutter_speed: toNumber(exif.ExposureTime),
              flash_fired: exif.Flash != null ? Boolean(toNumber(exif.Flash)) : null
            }
          };

          logger.debug('[AI Debug] [updatePhotoAIMetadata] Extracted rich metadata (buffer):', {
            hasCreatedAt: Boolean(richMetadata.created_at),
            hasGps: Boolean(richMetadata.gps),
            hasDevice: Boolean(richMetadata.device && (richMetadata.device.make || richMetadata.device.model)),
            hasExposure: Boolean(richMetadata.exposure && richMetadata.exposure.iso)
          });
        }
      } catch (metaErr) {
        logger.error('[Metadata Debug] Failed to extract metadata:', metaErr.message || metaErr, metaErr.stack);
        // Don't throw - continue without rich metadata
      }

      let fileBuffer;
      const isHeic = photoRow.filename.toLowerCase().endsWith('.heic') || photoRow.filename.toLowerCase().endsWith('.heif');

      if (isHeic) {
        logger.debug('[AI Debug] [updatePhotoAIMetadata] Detected HEIC file, converting to JPEG...');
        
        // Convert to JPEG using helper (handles fallback if sharp fails)
        const jpegBuffer = await convertHeicToJpegBuffer(originalBuffer);
        
        // Resize using sharp - use high quality settings to preserve image detail
        fileBuffer = await sharp(jpegBuffer)
          .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
          .withMetadata()
          .toFormat('jpeg', { quality: 95, mozjpeg: true })
          .toBuffer();
      } else {
        // Resize the original buffer
        fileBuffer = await sharp(originalBuffer)
          .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
          .withMetadata()
          .toFormat('jpeg', { quality: 95, mozjpeg: true })
          .toBuffer();
      }
      
      logger.debug('[AI Debug] [updatePhotoAIMetadata] Resized file buffer loaded. Buffer length:', fileBuffer.length);

      // Build GPS string from rich metadata if available
      if (richMetadata && richMetadata.gps && typeof richMetadata.gps.lat === 'number' && typeof richMetadata.gps.lon === 'number') {
        gps = `${richMetadata.gps.lat.toFixed(6)},${richMetadata.gps.lon.toFixed(6)}`;
        logger.info('[GPS] Using exiftool-extracted GPS:', gps);
      }

      // Build device string from rich metadata if available
      if (richMetadata && richMetadata.device && richMetadata.device.make && richMetadata.device.model) {
        device = `${richMetadata.device.make} ${richMetadata.device.model}`;
        logger.info('[Device] Using exiftool-extracted device:', device);
      }

      // Merge rich metadata into the legacy meta object for backward compatibility
      enrichedMeta = {
        ...meta,
        ...(richMetadata && {
          DateTimeOriginal: richMetadata.created_at,
          Make: richMetadata.device?.make,
          Model: richMetadata.device?.model,
          LensModel: richMetadata.device?.lens,
          ISO: richMetadata.exposure?.iso,
          FNumber: richMetadata.exposure?.f_stop,
          ExposureTime: richMetadata.exposure?.shutter_speed,
          Flash: richMetadata.exposure?.flash_fired,
          GPSLatitude: richMetadata.gps?.lat,
          GPSLongitude: richMetadata.gps?.lon,
          GPSAltitude: richMetadata.gps?.alt,
          UserComment: richMetadata.user_comment
        })
      };

      // Pass the resized JPEG buffer with enriched metadata
      const processedFilename = photoRow.filename + '.processed.jpg';

      // Detect if this is a recheck (existing AI metadata present)
      const isRecheck = Boolean(photoRow.caption && photoRow.caption.trim() !== '' && photoRow.caption !== 'Processing...');
      if (isRecheck) {
        logger.info(`[AI Recheck] Re-processing photo with existing metadata: ${photoRow.filename}`);
      }

      ai = await processPhotoAI({ 
        fileBuffer,
        filename: processedFilename, 
        metadata: enrichedMeta, 
        gps, 
        device,
        isRecheck
      }, modelOverrides);
      logger.debug('[AI Debug] [updatePhotoAIMetadata] processPhotoAI result keys', ai ? Object.keys(ai) : null);
    } catch (error) {
      logger.error(`AI processing failed for ${photoRow.filename} (attempt ${retryCount + 1}):`, error.message || error);
      if (error && error.stack) {
        logger.error('[AI Debug] Stack trace:', error.stack);
      }
      // Log error to audit system if we can extract runId from error context
      // The runId is created inside processPhotoAI, so we need to parse it from logs or accept that
      // top-level processPhotoAI failures won't have runId. For now, log with photoId as context.
      const auditLogger = require('./langgraph/audit_logger');
      auditLogger.logError(`photo-${photoRow.id}`, `AI Processing (${photoRow.filename})`, error);
      await db('photos').where({ id: photoRow.id }).update({ ai_retry_count: retryCount + 1 });
      return null;
    }
    const keywordCount = Array.isArray(ai?.keywords)
      ? ai.keywords.filter(Boolean).length
      : typeof ai?.keywords === 'string'
        ? ai.keywords.split(',').map((v) => v.trim()).filter(Boolean).length
        : 0;
    logger.info('[AI Update] Retrieved AI result for %s', photoRow.filename, {
      hasCaption: Boolean(ai?.caption),
      descriptionLength: typeof ai?.description === 'string' ? ai.description.length : 0,
      keywordCount,
      hasPoiAnalysis: Boolean(ai?.poi_analysis),
    });

    // Use non-null strings for DB and provide fallbacks when AI doesn't return a caption or keywords
    const description = ai && ai.description ? String(ai.description).trim() : 'AI processing failed';

    // Generate a short caption fallback from the first sentence of the description if caption missing
    const generateCaptionFallback = (desc) => {
      if (!desc) return 'AI processing failed';
      const firstSentence = desc.split(/[.\n]/)[0] || desc;
      const words = firstSentence.trim().split(/\s+/).slice(0, 10);
      return words.join(' ').replace(/[,:;]$/, '');
    };

    const caption = (ai && ai.caption && String(ai.caption).trim())
      ? String(ai.caption).trim()
      : generateCaptionFallback(description);

    // Simple keywords extractor: pick frequent non-stopwords from the description
    const generateKeywordsFallback = (desc) => {
      if (!desc) return '';
      const stopwords = new Set(['the', 'and', 'a', 'an', 'in', 'on', 'with', 'of', 'is', 'are', 'to', 'for', 'it', 'this', 'that', 'as', 'by', 'from', 'at', 'be', 'has', 'have', 'was', 'were', 'or', 'but', 'its', 'their', 'they', 'image', 'images', 'shows', 'show']);
      const words = desc.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
      const freq = {};
      for (const w of words) freq[w] = (freq[w] || 0) + 1;
      const items = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
      return items.join(', ');
    };

    let keywords = (ai && ai.keywords && String(ai.keywords).trim())
      ? String(ai.keywords).trim()
      : generateKeywordsFallback(description);

    // Use enrichedMeta if available (it contains the extracted GPS/device info), otherwise fallback to DB meta
    // Also use the updated 'gps' string to parse coordinates if available
    const finalMeta = (typeof enrichedMeta !== 'undefined') ? enrichedMeta : meta;
    let finalCoords = coords;
    if (gps && gps.includes(',')) {
      const [latStr, lonStr] = gps.split(',');
      const lat = Number(latStr);
      const lon = Number(lonStr);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        finalCoords = { lat, lon, source: 'enriched' };
      }
    }

    const metadataKeywordParts = buildMetadataKeywordParts(finalMeta, finalCoords);
    keywords = mergeKeywordStrings(keywords, metadataKeywordParts);

    // --- TRANSACTIONAL WRITE: update photos and insert collectible (if any) atomically ---
    await db.transaction(async trx => {
      // Determine which "extra" AI data to save. The graph returns *either*
      // poiAnalysis (for scenery/food) or collectibleInsights (for collectibles).
      // We save whichever one is present to the 'poi_analysis' JSONB column.
      const extraData = (ai && ai.collectibleInsights)
        ? ai.collectibleInsights
        : (ai && ai.poiAnalysis)
          ? ai.poiAnalysis
          : null;

      // Extract classification type from AI result
      const classificationType = (ai && ai.classification && typeof ai.classification === 'object')
        ? ai.classification.type
        : (ai && ai.classification)
          ? ai.classification
          : null;

      const dbUpdates = {
        caption,
        description,
        keywords,
        ai_retry_count: 0,
        poi_analysis: JSON.stringify(extraData || null),
        classification: classificationType
      };
      logger.debug('[AI Debug] [updatePhotoAIMetadata] Writing AI metadata to DB (transaction).');
      await trx('photos').where({ id: photoRow.id }).update(dbUpdates);

      // If collectibleInsights exists, insert into collectibles table
      if (ai && ai.collectibleInsights) {
        // Construct the History Entry for AI analysis versioning
        const historyEntry = {
          timestamp: new Date().toISOString(),
          model: process.env.AI_COLLECTIBLE_MODEL || process.env.OPENAI_MODEL || 'unknown',
          result: ai.collectibleInsights
        };

        // Extract specifics from collectibleInsights if available
        const specifics = ai.collectibleInsights.specifics 
          ? ai.collectibleInsights.specifics 
          : {};

        const collectibleRow = {
          photo_id: photoRow.id,
          user_id: photoRow.user_id, // Required for RLS (Row Level Security)
          name: caption, // Use the generated caption as the initial name
          // Fix: Use the correct column name (ai_analysis_history) and Array format
          ai_analysis_history: JSON.stringify([historyEntry]),
          // Fix: Populate the specifics column with clean data
          specifics: JSON.stringify(specifics),
          // Include other fields from collectibleInsights if available
          category: ai.collectibleInsights.category || null,
          condition_rank: ai.collectibleInsights.condition?.rank || null,
          condition_label: ai.collectibleInsights.condition?.label || null,
          value_min: ai.collectibleInsights.valuation?.lowEstimateUSD || null,
          value_max: ai.collectibleInsights.valuation?.highEstimateUSD || null,
          currency: 'USD',
          schema_version: 1
        };

        // Use onConflict to update history if row exists (Idempotency)
        const upsertResult = await trx('collectibles')
          .insert(collectibleRow)
          .onConflict('photo_id')
          .merge({
            // If it exists, append to history (PostgreSQL JSONB concatenation)
            // Fix: Add 'collectibles.' prefix to resolve column ambiguity in ON CONFLICT
            ai_analysis_history: trx.raw('"collectibles"."ai_analysis_history" || ?::jsonb', [JSON.stringify([historyEntry])]),
            specifics: collectibleRow.specifics, // Update specifics with latest
            category: collectibleRow.category,
            condition_rank: collectibleRow.condition_rank,
            condition_label: collectibleRow.condition_label,
            value_min: collectibleRow.value_min,
            value_max: collectibleRow.value_max,
            updated_at: new Date().toISOString()
          })
          .returning('id');
        
        // Capture the collectible_id from the upsert result
        const collectibleId = upsertResult && upsertResult[0] 
          ? (typeof upsertResult[0] === 'object' ? upsertResult[0].id : upsertResult[0])
          : null;
        
        logger.debug('[AI Debug] [updatePhotoAIMetadata] Upserted collectible for photo', photoRow.id, 'collectible_id:', collectibleId);

        // --- SPRINT 2: Persist market_data to collectible_market_data table ---
        // Check if valuation contains market_data array
        const marketData = ai.collectibleInsights?.valuation?.market_data;
        if (collectibleId && Array.isArray(marketData) && marketData.length > 0) {
          const marketDataRecords = marketData
            .filter(item => item && typeof item.price === 'number' && !Number.isNaN(item.price))
            .map(item => ({
              collectible_id: collectibleId,
              user_id: photoRow.user_id,
              price: item.price,
              venue: item.venue ? String(item.venue).substring(0, 255) : null,
              url: (item.url && typeof item.url === 'string' && item.url.length < 2048) ? item.url : null,
              date_seen: item.date_seen ? new Date(item.date_seen) : new Date(),
              condition_label: item.condition_label || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }));

          if (marketDataRecords.length > 0) {
            await trx('collectible_market_data').insert(marketDataRecords);
            logger.info('[AI Debug] [updatePhotoAIMetadata] Inserted %d market_data records for collectible %d', marketDataRecords.length, collectibleId);
          }
        }
      }
    });

    // Fetch saved row to confirm
    const saved = await db('photos').where({ id: photoRow.id }).first();
    logger.info('[AI Update] Saved DB values:', {
      caption: saved.caption,
      description: (saved.description || '').slice(0, 200),
      keywords: saved.keywords
    });
    logger.debug('[AI Debug] [updatePhotoAIMetadata] Returning AI result keys', ai ? Object.keys(ai) : null);
    return ai;
  } catch (error) {
    logger.error(`Unexpected error in updatePhotoAIMetadata for ${photoRow.filename}:`, error.message || error);
    return null;
  }
}

function isAIFailed(val) {
  return !val || val.trim().toLowerCase() === 'ai processing failed';
}


/**
 * Re-check and process all photos in the 'inprogress' state that are missing
 * AI metadata or have a retry count below threshold.
 *
 * This is intended to run at server start to pick up unfinished processing
 * tasks and will iterate through matching rows and call
 * `updatePhotoAIMetadata` for each.
 *
 * @param {Object} db - Knex database instance.
 */
async function processAllUnprocessedInprogress(db) {
  try {
    const rows = await db('photos')
      .where('state', 'inprogress')
      .andWhere(function () {
        this.whereNull('caption')
          .orWhereNull('description')
          .orWhereNull('keywords')
          .orWhere('ai_retry_count', '<', 2);
      });
    
    logger.info(`[RECHECK] Found ${rows.length} inprogress files needing AI processing`);
    for (const row of rows) {
      if (
        !isAIFailed(row.caption) &&
        !isAIFailed(row.description) &&
        !isAIFailed(row.keywords) &&
        (!row.ai_retry_count || row.ai_retry_count < 2)
      ) {
        logger.info(`[RECHECK] Skipping ${row.filename} (already has valid AI metadata)`);
        continue;
      }
      
      const storagePath = row.storage_path || `${row.state}/${row.filename}`;
      logger.info(`[RECHECK] Processing AI metadata for ${row.filename} at ${storagePath}`);
      await updatePhotoAIMetadata(db, row, storagePath);
    }
    return rows.length;
  } catch (error) {
    logger.error('[RECHECK] Error processing unprocessed inprogress files:', error);
    throw error;
  }
}

module.exports = {
  processPhotoAI,
  updatePhotoAIMetadata,
  isAIFailed,
  processAllUnprocessedInprogress,
  openai, // Expose native OpenAI client for downstream consumers
  extractLatLon,
};
