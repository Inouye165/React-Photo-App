const fs = require('fs');
const path = require('path');
require('../env');
const logger = require('../logger');

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

// Hard limit for AI processing file size (20 MB)
const MAX_AI_FILE_SIZE = 20 * 1024 * 1024;
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

function extractLatLon(meta) {
  if (!meta || typeof meta !== 'object') return null;
  let lat = toNumber(meta.latitude);
  let lon = toNumber(meta.longitude);
  if (lat !== null && lon !== null) {
    return { lat, lon };
  }

  if (meta.GPSLatitude && meta.GPSLongitude) {
    lat = dmsArrayToDecimal(meta.GPSLatitude, meta.GPSLatitudeRef);
    lon = dmsArrayToDecimal(meta.GPSLongitude, meta.GPSLongitudeRef);
    if (lat !== null && lon !== null) {
      return { lat, lon };
    }
  }

  const nestedSources = [meta.GPS, meta.GPSInfo, meta.Location, meta.Composite];
  for (const source of nestedSources) {
    if (source && typeof source === 'object' && source !== meta) {
      const nested = extractLatLon(source);
      if (nested) return nested;
    }
  }

  return null;
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
  const dateMatch = dateStamp.match(/^([0-9]{4})[:-]([0-9]{2})[:-]([0-9]{2})$/);
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
    { angle: 270, label: 'West' },
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



/**
 * Generate caption, description and keywords for a photo using the LangGraph workflow.
 *
 * @param {Object} options - The processing options.
 * @param {Buffer} options.fileBuffer - Raw image bytes (Buffer).
 * @param {string} options.filename - The filename (used to infer mime/extension).
 * @param {Object|string} [options.metadata] - EXIF/metadata associated with the image. May be a stringified JSON.
 * @param {string} [options.gps] - Precomputed GPS string (lat,lon) or empty string.
 * @param {string} [options.device] - Device make/model string.
 * @returns {Promise<Object>} Resolves with an object: { caption, description, keywords }.
 * @throws Error when the workflow returns an error or omits the final result payload.
 */
async function processPhotoAI({ fileBuffer, filename, metadata, gps, device }, modelOverrides = {}) {
  let imageBuffer;
  let imageMime;
  const ext = path.extname(filename).toLowerCase();
  logger.info(`[AI Debug] [processPhotoAI] Starting for filename: ${filename}`);
  if (ext === '.heic' || ext === '.heif') {
    imageBuffer = await convertHeicToJpegBuffer(fileBuffer, 90);
    imageMime = 'image/jpeg';
    try {
      const debugPath = path.join(__dirname, 'debug_image.jpg');
      fs.writeFileSync(debugPath, imageBuffer);
      logger.debug(`[Graph Debug] Saved intermediate JPEG buffer to ${debugPath}`);
    } catch (e) {
      logger.error(`[Graph Debug] Failed to write debug image: ${e.message}`);
    }
  } else {
    imageBuffer = fileBuffer;
    imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
  }
  const imageBase64 = imageBuffer.toString('base64');
  logger.debug('[Graph] Prepared image buffer for graph invocation', { filename, imageMime });
  logger.info(`[Graph Debug] imageMime before graph: ${imageMime}`);
  logger.info(`[AI Debug] [processPhotoAI] Invoking aiGraph with input:`, {
    filename,
    imageMime,
    imageBase64Length: imageBase64.length,
    metadata,
    gps,
    device,
    modelOverrides
  });

  let meta = {};
  if (typeof metadata === 'string') {
    try {
      meta = JSON.parse(metadata || '{}');
    } catch (parseErr) {
      logger.warn('[AI] Failed to parse metadata string; using empty metadata.', parseErr.message || parseErr);
      meta = {};
    }
  } else if (metadata && typeof metadata === 'object') {
    meta = metadata;
  }

  const initialState = {
    filename,
    fileBuffer,
    imageBase64,
    imageMime,
    metadata: meta,
    gpsString: gps || null,
    device: device || null,
    modelOverrides: modelOverrides || {},
    classification: null,
    poiAnalysis: null,
    rich_search_context: null,
    finalResult: null,
    error: null,
  };

  logger.info(`[Graph] Invoking graph for ${filename}...`);
  const finalState = await aiGraph.invoke(initialState);
  logger.info('[AI Debug] [processPhotoAI] aiGraph.invoke returned:', finalState);

  if (finalState.error) {
    logger.error(`[AI Debug] [processPhotoAI] aiGraph.invoke error: ${finalState.error}`);
    throw new Error(`AI Graph processing failed: ${finalState.error}`);
  }
  if (!finalState.finalResult) {
    logger.error('[AI Debug] [processPhotoAI] aiGraph.invoke finished but produced no finalResult.');
    throw new Error('AI Graph finished but produced no finalResult.');
  }

  const result = {
    ...finalState.finalResult,
    classification: finalState.classification,
  };

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
 *   provided storagePath.
 * - Call processPhotoAI to obtain AI-generated metadata.
 * - Update the photo row with results, manage ai_retry_count and provide
 *   fallbacks when AI does not return expected fields.
 *
 * @param {Object} db - Knex database instance (must support .from/.where/.update/.first).
 * @param {Object} photoRow - Database row object for the photo (must include id, filename, metadata, ai_retry_count).
 * @param {string} storagePath - Path in Supabase storage bucket to download the file from.
 * @returns {Promise<Object|null>} Returns the AI result object on success, or null when processing failed or retried.
 * @throws Will re-throw unexpected errors only in rare cases; normally returns null on recoverable failures.
 */
async function updatePhotoAIMetadata(db, photoRow, storagePath, modelOverrides = {}) {
  try {
    logger.info('[AI Debug] [updatePhotoAIMetadata] Called with:', {
      photoId: photoRow.id,
      filename: photoRow.filename,
      storagePath,
      modelOverrides
    });
  const meta = JSON.parse(photoRow.metadata || '{}');
  logger.info('[AI Debug] [updatePhotoAIMetadata] Parsed metadata:', meta);

    const coords = extractLatLon(meta);
    let gps = '';
    if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
      gps = `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}`;
    }
    
    const device = meta.Make && meta.Model ? `${meta.Make} ${meta.Model}` : '';
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
      logger.info('[AI Debug] [updatePhotoAIMetadata] Marked as permanently failed in DB.');
      return null;
    }
    
    let ai;
    try {
      // Download file from Supabase Storage
      logger.info('[AI Debug] [updatePhotoAIMetadata] Downloading file from storage:', storagePath);
      const { data: fileData, error } = await supabase.storage
        .from('photos')
        .download(storagePath);
      if (error) {
        logger.error(`[AI Debug] [updatePhotoAIMetadata] Failed to download file from storage: ${error.message}`);
        throw new Error(`Failed to download file from storage: ${error.message}`);
      }
      logger.info('[AI Debug] [updatePhotoAIMetadata] File downloaded. Size:', fileData.size);
      // Enforce OOM safeguard: check file size before processing
      if (typeof fileData.size === 'number' && fileData.size > MAX_AI_FILE_SIZE) {
        logger.error(`[AI OOM] File too large for AI processing: ${photoRow.filename} (${fileData.size} bytes)`);
        throw new Error(`File too large for AI processing: ${fileData.size} bytes (limit: ${MAX_AI_FILE_SIZE})`);
      }
      const fileBuffer = await fileData.arrayBuffer();
      logger.info('[AI Debug] [updatePhotoAIMetadata] File buffer loaded. Buffer length:', fileBuffer.byteLength);
      ai = await processPhotoAI({ 
        fileBuffer: Buffer.from(fileBuffer), 
        filename: photoRow.filename, 
        metadata: meta, 
        gps, 
        device 
      }, modelOverrides);
      logger.info('[AI Debug] [updatePhotoAIMetadata] processPhotoAI result:', ai);
    } catch (error) {
      logger.error(`AI processing failed for ${photoRow.filename} (attempt ${retryCount + 1}):`, error.message || error);
      if (error && error.stack) {
        logger.error('[AI Debug] Stack trace:', error.stack);
      }
      await db('photos').where({ id: photoRow.id }).update({ ai_retry_count: retryCount + 1 });
      return null;
    }
    logger.info('[AI Update] Retrieved AI result for', photoRow.filename, JSON.stringify({
      caption: ai && ai.caption,
      description: ai && (ai.description || '').slice(0, 200),
      keywords: ai && ai.keywords
    }));

    // Ensure non-null strings for DB and provide fallbacks when AI doesn't return a caption or keywords
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

    const metadataKeywordParts = buildMetadataKeywordParts(meta, coords);
    keywords = mergeKeywordStrings(keywords, metadataKeywordParts);




    // Remove model history tracking for now (no model constants)
    logger.info('[AI Debug] [updatePhotoAIMetadata] Writing AI metadata to DB:', {
      caption,
      description,
      keywords,
      ai_retry_count: 0,
      poi_analysis: JSON.stringify((ai && ai.poiAnalysis) || null)
    });
    await db('photos').where({ id: photoRow.id }).update({
      caption,
      description,
      keywords,
      ai_retry_count: 0,
      poi_analysis: JSON.stringify((ai && ai.poiAnalysis) || null)
    });
    // Fetch saved row to confirm
    const saved = await db('photos').where({ id: photoRow.id }).first();
    logger.info('[AI Update] Saved DB values:', {
      caption: saved.caption,
      description: (saved.description || '').slice(0, 200),
      keywords: saved.keywords
    });
  logger.info('[AI Debug] [updatePhotoAIMetadata] Returning AI result:', ai);
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
};