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
const { ROUTER_MODEL, SCENERY_MODEL, COLLECTIBLE_MODEL } = require('./langchain/agents');
const { googlePlacesTool } = require('./langchain/tools/googlePlacesTool');
const { app: aiGraph } = require('./langgraph/graph');

void googlePlacesTool; // ensure tool module loads for downstream consumers

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
  // Removed excessive base64 logging for security and performance
  logger.debug('[Graph] Prepared image buffer for graph invocation', { filename, imageMime });
  logger.info(`[Graph Debug] imageMime before graph: ${imageMime}`);

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

  if (finalState.error) {
    throw new Error(`AI Graph processing failed: ${finalState.error}`);
  }

  if (!finalState.finalResult) {
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
    const meta = JSON.parse(photoRow.metadata || '{}');
    
    // Convert DMS GPS coordinates to decimal degrees
    let gps = '';
    if (meta.GPSLatitude && meta.GPSLongitude) {
      const latDMS = Array.isArray(meta.GPSLatitude) ? meta.GPSLatitude : [meta.GPSLatitude];
      const lonDMS = Array.isArray(meta.GPSLongitude) ? meta.GPSLongitude : [meta.GPSLongitude];
      
      const latDecimal = latDMS[0] + (latDMS[1] || 0) / 60 + (latDMS[2] || 0) / 3600;
      const lonDecimal = lonDMS[0] + (lonDMS[1] || 0) / 60 + (lonDMS[2] || 0) / 3600;
      
      // Apply hemisphere signs
      const latSign = meta.GPSLatitudeRef === 'S' ? -1 : 1;
      const lonSign = meta.GPSLongitudeRef === 'W' ? -1 : 1;
      
      gps = `${latDecimal * latSign},${lonDecimal * lonSign}`;
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
      return null;
    }
    
    let ai;
    try {
      // Download file from Supabase Storage
      const { data: fileData, error } = await supabase.storage
        .from('photos')
        .download(storagePath);
      
      if (error) {
        throw new Error(`Failed to download file from storage: ${error.message}`);
      }
      
      // Enforce OOM safeguard: check file size before processing
      if (typeof fileData.size === 'number' && fileData.size > MAX_AI_FILE_SIZE) {
        logger.error(`[AI OOM] File too large for AI processing: ${photoRow.filename} (${fileData.size} bytes)`);
        throw new Error(`File too large for AI processing: ${fileData.size} bytes (limit: ${MAX_AI_FILE_SIZE})`);
      }

      const fileBuffer = await fileData.arrayBuffer();

      ai = await processPhotoAI({ 
        fileBuffer: Buffer.from(fileBuffer), 
        filename: photoRow.filename, 
        metadata: meta, 
        gps, 
        device 
      }, modelOverrides);
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

    const keywords = (ai && ai.keywords && String(ai.keywords).trim())
      ? String(ai.keywords).trim()
      : generateKeywordsFallback(description);

    // Append model usage entry to ai_model_history (stored as JSON text)
    let prevHistory = [];
    try {
      if (photoRow.ai_model_history) {
        prevHistory = typeof photoRow.ai_model_history === 'string'
          ? JSON.parse(photoRow.ai_model_history || '[]')
          : photoRow.ai_model_history;
      }
    } catch (e) {
      logger.warn('Failed to parse existing ai_model_history for', photoRow.id, e && e.message);
      prevHistory = [];
    }

    const modelEntry = {
      timestamp: new Date().toISOString(),
      runType: modelOverrides && Object.keys(modelOverrides).length ? 'recheck' : 'initial',
      classification: (ai && ai.classification) || null,
      modelsUsed: {
        router: (modelOverrides && modelOverrides.router) || ROUTER_MODEL,
        scenery: (modelOverrides && modelOverrides.scenery) || SCENERY_MODEL,
        collectible: (modelOverrides && modelOverrides.collectible) || COLLECTIBLE_MODEL
      },
      result: {
        caption,
        keywords
      }
    };

    const newHistory = Array.isArray(prevHistory) ? [...prevHistory, modelEntry] : [modelEntry];

    await db('photos').where({ id: photoRow.id }).update({
      caption,
      description,
      keywords,
      ai_retry_count: 0,
      poi_analysis: JSON.stringify((ai && ai.poiAnalysis) || null),
      ai_model_history: JSON.stringify(newHistory)
    });

    // Fetch saved row to confirm
    const saved = await db('photos').where({ id: photoRow.id }).first();
    logger.info('[AI Update] Saved DB values:', {
      caption: saved.caption,
      description: (saved.description || '').slice(0, 200),
      keywords: saved.keywords
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

/**
 * Re-check and process all photos in the 'inprogress' state that are missing
 * AI metadata or have a retry count below threshold.
 *
 * This is intended to run at server start to pick up unfinished processing
 * tasks and will iterate through matching rows and call
 * `updatePhotoAIMetadata` for each.
 *
 * @param {Object} db - Knex database instance.
 * @returns {Promise<number>} Number of rows found (and attempted) for reprocessing.
 * @throws Will propagate any database errors encountered while querying.
 */
async function processAllUnprocessedInprogress(db) {
  try {
    const rows = await db('photos')
      .where({ state: 'inprogress' })
      .andWhere(function() {
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