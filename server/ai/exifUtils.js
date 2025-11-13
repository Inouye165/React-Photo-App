const path = require('path');
require('../env');
const logger = require('../logger');

// fail-fast (prod/dev), allow tests without key
if (!process.env.OPENAI_API_KEY) {
  if (process.env.NODE_ENV === 'test') {
    logger.warn('OPENAI_API_KEY not set — skipping fail-fast in test environment.');
  } else {
    throw new Error('OPENAI_API_KEY not set in .env');
  }
}

const openai = require('./openaiClient');
const supabase = require('../lib/supabaseClient');
const { convertHeicToJpegBuffer } = require('../media/image');
const { app: aiGraph } = require('./langgraph/graph');

// EXIF helpers come from exifUtils
const {
  extractLatLon,
  getBestCaptureDate,
  buildMetadataKeywordParts,
  mergeKeywordStrings,
  // optional but handy:
  // summarizeMeta,
} = require('./exifUtils');

const MAX_AI_FILE_SIZE = 20 * 1024 * 1024;

// tiny helper to print a short summary w/o dumping full EXIF
function summarizeMeta(meta) {
  const keys = Object.keys(meta || {});
  const make = meta?.Make || meta?.make || null;
  const model = meta?.Model || meta?.model || null;
  const hasGps = !!(meta?.latitude ?? meta?.longitude ?? meta?.GPS ?? meta?.GPSInfo ?? meta?.GPSLatitude);
  const dt =
    meta?.DateTimeOriginal || meta?.CreateDate || meta?.DateCreated || meta?.ModifyDate || null;
  return { keyCount: keys.length, keysPreview: keys.slice(0, 25), make, model, hasGps, dateCandidate: dt };
}

async function processPhotoAI({ fileBuffer, filename, metadata, gps, device }, modelOverrides = {}) {
  let imageBuffer;
  let imageMime;
  const ext = path.extname(filename).toLowerCase();

  logger.debug(`[AI Debug] [processPhotoAI] Starting for filename: ${filename}`);

  if (ext === '.heic' || ext === '.heif') {
    imageBuffer = await convertHeicToJpegBuffer(fileBuffer, 90);
    imageMime = 'image/jpeg';
  } else {
    imageBuffer = fileBuffer;
    imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
  }

  const imageBase64 = imageBuffer.toString('base64');
  logger.debug('[Graph] Prepared image buffer for graph invocation', { filename, imageMime });

  // normalize metadata for the LLM (add dateTime, cameraModel)
  let meta = {};
  if (typeof metadata === 'string') {
    try { meta = JSON.parse(metadata || '{}'); } catch { meta = {}; }
  } else if (metadata && typeof metadata === 'object') {
    meta = metadata;
  }
  const captureDate = getBestCaptureDate(meta);
  const deviceModel =
    (meta.Make && meta.Model) ? `${meta.Make} ${meta.Model}` :
    (meta.Model || meta.Make || null);

  const normalizedForLLM = {
    ...meta,
    dateTime: captureDate ? captureDate.toISOString() : null,
    cameraModel: deviceModel || null,
  };

  const initialState = {
    filename,
    fileBuffer,
    imageBase64,
    imageMime,
    metadata: normalizedForLLM,
    gpsString: gps || null,
    device: device || null,
    modelOverrides: modelOverrides || {},
    classification: null,
    poiAnalysis: null,
    rich_search_context: null,
    finalResult: null,
    error: null,
  };

  // helpful diagnostics
  logger.info('[META] LLM summary:', summarizeMeta(normalizedForLLM));
  logger.info('[GPS] pre-graph gpsString = %s', initialState.gpsString);

  logger.info(`[Graph] Invoking graph for ${filename}...`);
  const finalState = await aiGraph.invoke(initialState);

  if (finalState.error) {
    throw new Error(`AI Graph processing failed: ${finalState.error}`);
  }
  if (!finalState.finalResult) {
    throw new Error('AI Graph finished but produced no finalResult.');
  }

  const result = {
    ...finalState.finalResult,
    classification: finalState.classification,
    // bubble up optional extra data for DB write step
    poiAnalysis: finalState.poiAnalysis ?? null,
  };

  logger.info('[AI Result] caption:', result.caption);
  logger.info('[AI Result] description (truncated):', (result.description || '').slice(0, 300));
  logger.info('[AI Result] keywords:', result.keywords);

  return result;
}

async function updatePhotoAIMetadata(db, photoRow, storagePath, modelOverrides = {}) {
  try {
    logger.debug('[AI Debug] [updatePhotoAIMetadata] Called with', {
      photoId: photoRow.id,
      filename: photoRow.filename,
      storagePath,
      modelOverrideKeys: Object.keys(modelOverrides || {}),
    });

    const meta = JSON.parse(photoRow.metadata || '{}');
    logger.info('[META] db-row summary:', summarizeMeta(meta));

    // derive gps string from EXIF if possible
    const coords = extractLatLon(meta);
    let gps = '';
    if (coords && typeof coords.lat === 'number' && typeof coords.lon === 'number') {
      gps = `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}`;
      if (process.env.DEBUG_GPS === '1') {
        logger.info('[GPS] set gpsString from %s → %s', coords.source, gps);
      }
    } else if (process.env.DEBUG_GPS === '1') {
      logger.info('[GPS] no coords extracted (source=%s)', coords && coords.source);
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
        poi_analysis: null,
      });
      return null;
    }

    // download from Supabase
    logger.debug('[AI Debug] [updatePhotoAIMetadata] Downloading file from storage:', storagePath);
    const { data: fileData, error } = await supabase.storage.from('photos').download(storagePath);
    if (error) {
      logger.error(`[AI Debug] [updatePhotoAIMetadata] Failed to download file from storage: ${error.message}`);
      await db('photos').where({ id: photoRow.id }).update({ ai_retry_count: retryCount + 1 });
      return null;
    }
    if (typeof fileData.size === 'number' && fileData.size > MAX_AI_FILE_SIZE) {
      logger.error(`[AI OOM] File too large for AI processing: ${photoRow.filename} (${fileData.size} bytes)`);
      await db('photos').where({ id: photoRow.id }).update({ ai_retry_count: retryCount + 1 });
      return null;
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    logger.info('[AI Debug] [updatePhotoAIMetadata] File buffer loaded. Buffer length:', fileBuffer.length);

    // run AI
    let ai;
    try {
      ai = await processPhotoAI({ fileBuffer, filename: photoRow.filename, metadata: meta, gps, device }, modelOverrides);
    } catch (e) {
      logger.error(`AI processing failed for ${photoRow.filename} (attempt ${retryCount + 1}):`, e.message || e);
      await db('photos').where({ id: photoRow.id }).update({ ai_retry_count: retryCount + 1 });
      return null;
    }

    // ensure caption/keywords fallbacks
    const description = ai?.description ? String(ai.description).trim() : 'AI processing failed';
    const caption = (ai?.caption && String(ai.caption).trim())
      ? String(ai.caption).trim()
      : (description.split(/[.\n]/)[0] || 'AI processing failed');

    let keywords = (ai?.keywords && String(ai.keywords).trim())
      ? String(ai.keywords).trim()
      : '';

    // merge explicit EXIF-derived metadata keywords
    const metaParts = buildMetadataKeywordParts(meta, coords);
    keywords = mergeKeywordStrings(keywords, metaParts);

    // decide which extra data to store
    const extraData = ai?.collectibleInsights ? ai.collectibleInsights : (ai?.poiAnalysis ?? null);

    // transactional write
    await db.transaction(async (trx) => {
      await trx('photos')
        .where({ id: photoRow.id })
        .update({
          caption,
          description,
          keywords,
          ai_retry_count: 0,
          poi_analysis: JSON.stringify(extraData || null),
        });

      if (ai?.collectibleInsights) {
        await trx('collectibles').insert({
          photo_id: photoRow.id,
          name: caption,
          ai_analysis: JSON.stringify(ai.collectibleInsights),
          user_notes: '',
        });
      }
    });

    const saved = await db('photos').where({ id: photoRow.id }).first();
    logger.info('[AI Update] Saved DB values:', {
      caption: saved.caption,
      description: (saved.description || '').slice(0, 200),
      keywords: saved.keywords,
    });

    return ai;
  } catch (error) {
    logger.error(`Unexpected error in updatePhotoAIMetadata for ${photoRow.filename}:`, error.message || error);
    return null;
  }
}

function isAIFailed(val) {
  return !val || val.trim().toLowerCase() === 'ai processing failed';
}

async function processAllUnprocessedInprogress(db) {
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
    if (!isAIFailed(row.caption) && !isAIFailed(row.description) && !isAIFailed(row.keywords) && (!row.ai_retry_count || row.ai_retry_count < 2)) {
      logger.info(`[RECHECK] Skipping ${row.filename} (already has valid AI metadata)`);
      continue;
    }
    const storagePath = row.storage_path || `${row.state}/${row.filename}`;
    logger.info(`[RECHECK] Processing AI metadata for ${row.filename} at ${storagePath}`);
    await updatePhotoAIMetadata(db, row, storagePath);
  }
  return rows.length;
}

module.exports = {
  processPhotoAI,
  updatePhotoAIMetadata,
  isAIFailed,
  processAllUnprocessedInprogress,
  openai,
};
