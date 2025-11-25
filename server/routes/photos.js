// Helper: retry DB operation on transient connection errors
function isTransientDbError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('connection terminated unexpectedly') ||
    err.code === 'ECONNRESET' ||
    err.code === '57P01'
  );
}

async function withDbRetry(operation, { retries = 2, delayMs = 150 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (!isTransientDbError(err) || attempt === retries) {
        throw err;
      }
      lastErr = err;
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  throw lastErr;
}
const express = require('express');
const path = require('path');
const { Readable } = require('stream');
const { convertHeicToJpegBuffer } = require('../media/image');
const { addAIJob, checkRedisAvailable } = require('../queue/index');
const OpenAI = require('openai');
const logger = require('../logger');
const { signThumbnailUrl, DEFAULT_TTL_SECONDS } = require('../utils/urlSigning');
// LangChain removed: dynamic allowlist for compatibility
const openai = new OpenAI();
const DYNAMIC_MODEL_ALLOWLIST = [];
const INTERNAL_MODEL_NAMES = ['router', 'scenery', 'collectible'];
const INTERNAL_MODEL_SET = new Set(INTERNAL_MODEL_NAMES);
const FALLBACK_MODEL_ALLOWLIST = ['gpt-4o', 'gpt-4-vision-preview', 'gpt-3.5-turbo', 'gpt-5'];
const ALLOWED_MODEL_PREFIXES = ['gpt-5', 'gpt-4', 'gpt-3.5', 'ft:', 'o1', 'o3'];
const EXCLUDED_MODEL_SUBSTRINGS = ['embedding', 'vector', 'tts', 'audio', 'whisper', 'dall-e', 'image', 'realtime', 'omni-moderation'];
const MODEL_ALLOWLIST = DYNAMIC_MODEL_ALLOWLIST;

// Seed the allowlist with a fallback so routes have sensible defaults before async loading completes.
const initialFallback = Array.from(new Set([...FALLBACK_MODEL_ALLOWLIST, ...INTERNAL_MODEL_NAMES]));
DYNAMIC_MODEL_ALLOWLIST.push(...initialFallback);
let LAST_ALLOWLIST_SOURCE = 'seed';
let LAST_ALLOWLIST_UPDATED_AT = new Date().toISOString();

async function loadDynamicAllowList() {
  try {
    // Skip OpenAI API calls in test environment to prevent ECONNRESET errors
    if (process.env.NODE_ENV === 'test') {
      const fallbackModels = Array.from(new Set([...FALLBACK_MODEL_ALLOWLIST, ...INTERNAL_MODEL_NAMES]));
      DYNAMIC_MODEL_ALLOWLIST.splice(0, DYNAMIC_MODEL_ALLOWLIST.length, ...fallbackModels);
      LAST_ALLOWLIST_SOURCE = 'test-fallback';
      LAST_ALLOWLIST_UPDATED_AT = new Date().toISOString();
      logger.info('[AI Models] Using fallback allowlist in test environment');
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await openai.models.list();
    const dynamicModels = (response?.data || [])
      .map(model => model?.id)
      .filter(id => typeof id === 'string' && id.length > 0)
      .filter(id => ALLOWED_MODEL_PREFIXES.some(prefix => id.startsWith(prefix)))
      .filter(id => !EXCLUDED_MODEL_SUBSTRINGS.some(substr => id.includes(substr)));

  const uniqueModels = Array.from(new Set([...dynamicModels, ...INTERNAL_MODEL_NAMES]));

    if (dynamicModels.length === 0) {
      const fallbackModels = Array.from(new Set([...FALLBACK_MODEL_ALLOWLIST, ...INTERNAL_MODEL_NAMES]));
      DYNAMIC_MODEL_ALLOWLIST.splice(0, DYNAMIC_MODEL_ALLOWLIST.length, ...fallbackModels);
  logger.warn('[AI Models] OpenAI API returned no eligible models. Using fallback allowlist.');
      LAST_ALLOWLIST_SOURCE = 'fallback-empty-response';
      LAST_ALLOWLIST_UPDATED_AT = new Date().toISOString();
      return;
    }

    DYNAMIC_MODEL_ALLOWLIST.splice(0, DYNAMIC_MODEL_ALLOWLIST.length, ...uniqueModels);
    LAST_ALLOWLIST_SOURCE = 'dynamic';
    LAST_ALLOWLIST_UPDATED_AT = new Date().toISOString();
    logger.info('[AI Models] Loaded dynamic model allowlist', { count: uniqueModels.length });
  } catch (err) {
    const fallbackModels = Array.from(new Set([...FALLBACK_MODEL_ALLOWLIST, ...INTERNAL_MODEL_NAMES]));
    DYNAMIC_MODEL_ALLOWLIST.splice(0, DYNAMIC_MODEL_ALLOWLIST.length, ...fallbackModels);
    LAST_ALLOWLIST_SOURCE = 'fallback-error';
    LAST_ALLOWLIST_UPDATED_AT = new Date().toISOString();
    logger.error('[AI Models] Failed to load dynamic model allowlist. Using fallback.', { error: err && err.message });
  }
}

// Load allowlist asynchronously to avoid blocking module initialization
// This prevents ECONNRESET errors during rapid test runs
loadDynamicAllowList().catch(err => {
  // Already handled inside loadDynamicAllowList, but catch here to prevent unhandled rejection
  logger.error('[AI Models] Unhandled error in loadDynamicAllowList', { error: err && err.message });
});
const sharp = require('sharp');
const exifr = require('exifr');
const supabase = require('../lib/supabaseClient');
const { authenticateToken } = require('../middleware/auth');
const { authenticateImageRequest } = require('../middleware/imageAuth');

module.exports = function createPhotosRouter({ db }) {
  const router = express.Router();

  // Helper: format storage/external errors into a readable, serializable shape
  const util = require('util');
  const INCLUDE_ERROR_DETAILS = process.env.NODE_ENV !== 'production';
  function formatStorageError(err) {
    if (!err) return { message: 'Unknown error' };
    // Pull common fields
    let message = err.message || err.msg || err.error_description || err.error || (typeof err === 'string' ? err : null);
    // If message is an object, try to stringify it for readability
    if (message && typeof message === 'object') {
      try {
        message = JSON.stringify(message);
      } catch {
        message = util.inspect(message, { depth: 2 });
      }
    }
    const status = err.status || err.statusCode || err.status_code || null;
    const code = err.code || null;

    // Collect a few helpful details without serializing everything (avoid secrets)
    const details = {};
    ['hint', 'details', 'cause', 'path', 'type', 'name'].forEach(k => {
      if (err[k]) details[k] = err[k];
    });

  if (message && message !== '{}' && message !== '[]' && message !== '') return { message, status, code, details };

    // Fall back to a safe util.inspect when there is no obvious message
    try {
      return { message: util.inspect(err, { depth: 2 }), status, code, details };
    } catch {
      return { message: String(err), status, code, details };
    }
  }

  // --- API: List all photos and metadata (include hash) ---
  // Router-root: defined here as '/' so mounting at '/photos' results in
  // final path '/photos'.
  router.get('/', authenticateToken, async (req, res) => {
    // Add a simple correlation/request id for tracing
    const reqId = Math.random().toString(36).slice(2, 10);
    try {
      const state = req.query.state;
      // Protect against long-running DB queries causing the request to hang
      const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 10000);

      const rows = await Promise.race([
        withDbRetry(
        () => {
          let query = db('photos').select(
            'id',
            'filename',
            'state',
            'metadata',
            'hash',
            'file_size',
            'caption',
            'description',
            'keywords',
            'text_style',
            'edited_filename',
            'storage_path',
            'ai_model_history'
          ).where('user_id', req.user.id);
          if (state === 'working' || state === 'inprogress' || state === 'finished') {
            query = query.where({ state });
          }
          return query;
        },
        { retries: 2, delayMs: 150 }
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timeout')), DB_QUERY_TIMEOUT_MS)),
      ]);
      // Generate public URLs for each photo using Supabase Storage
      const photosWithUrls = await Promise.all(rows.map(async (row) => {
        let textStyle = null;
        if (row.text_style) {
          try {
            textStyle = JSON.parse(row.text_style);
          } catch (parseErr) {
            logger.warn('Failed to parse text_style for photo', row.id, parseErr.message);
          }
        }
        // The frontend will receive fully signed URLs below.
        // Use simple relative paths for images and thumbnails. Image access
        // is protected by httpOnly cookie-based authentication on /display/*.
        let thumbnailUrl = null;
        let photoUrl = null;
        if (row.hash) {
          thumbnailUrl = `/display/thumbnails/${row.hash}.jpg`;
        }
        photoUrl = `/display/${row.state}/${row.filename}`;
        let parsedHistory = null;
        try { parsedHistory = row.ai_model_history ? JSON.parse(row.ai_model_history) : null; } catch { parsedHistory = null; }
        return {
          id: row.id,
          filename: row.filename,
          state: row.state,
          metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {}),
          hash: row.hash,
          file_size: row.file_size,
          caption: row.caption,
          description: row.description,
          keywords: row.keywords,
          textStyle,
          editedFilename: row.edited_filename,
          storagePath: row.storage_path,
          url: photoUrl,
          thumbnail: thumbnailUrl,
          aiModelHistory: parsedHistory
        };
      }));
      // Prevent caching so frontend always gets fresh filtered results
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, photos: photosWithUrls });
    } catch (err) {
      // Improved error logging for diagnostics
      logger.error('[photos] DB error', {
        reqId,
        endpoint: '/photos',
        query: req.query,
        state: req.query.state,
        error: {
          message: err && err.message,
          code: err && err.code,
          stack: err && err.stack && err.stack.split('\n').slice(0, 3).join(' | ')
        }
      });
      res.status(500).json({ success: false, error: err.message, reqId });
    }
  });

  router.get('/models', authenticateToken, (req, res) => {
    try {
      const filtered = DYNAMIC_MODEL_ALLOWLIST
        .filter(item => typeof item === 'string' && item.length > 0 && !INTERNAL_MODEL_SET.has(item));
      const fallbackPublic = FALLBACK_MODEL_ALLOWLIST.filter(item => !INTERNAL_MODEL_SET.has(item));
      const models = filtered.length > 0 ? filtered : fallbackPublic;
      res.set('Cache-Control', 'no-store');
      res.json({
        success: true,
        models,
        source: LAST_ALLOWLIST_SOURCE,
        updatedAt: LAST_ALLOWLIST_UPDATED_AT
      });
    } catch (error) {
      logger.error('[AI Models] Failed to expose model allowlist', error && error.message ? error : error);
      res.status(500).json({ success: false, error: 'Failed to load model allowlist' });
    }
  });

  router.get('/dependencies', authenticateToken, async (req, res) => {
    try {
      const redisAvailable = await checkRedisAvailable();
      res.set('Cache-Control', 'no-store');
      res.json({
        success: true,
        dependencies: {
          aiQueue: Boolean(redisAvailable),
        },
      });
    } catch (error) {
      logger.error('[Dependencies] Failed to report dependency status', error && error.message ? error : error);
      res.status(500).json({ success: false, error: 'Failed to determine dependency status' });
    }
  });

  // --- Metadata update endpoint ---
  // --- Single photo fetch endpoint ---
  router.get('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db('photos').where({ id, user_id: req.user.id }).first();
      if (!row) return res.status(404).json({ success: false, error: 'Photo not found' });

      let textStyle = null;
      if (row.text_style) {
        try { textStyle = JSON.parse(row.text_style); } catch { textStyle = null; }
      }

      // Provide relative image URLs; /display/* is protected by the cookie auth middleware.
      let url = null;
      let thumbnail = null;
      if (row.hash) thumbnail = `/display/thumbnails/${row.hash}.jpg`;
      url = `/display/${row.state}/${row.filename}`;

      const photo = {
        id: row.id,
        filename: row.filename,
        state: row.state,
        metadata: JSON.parse(row.metadata || '{}'),
        hash: row.hash,
        file_size: row.file_size,
        caption: row.caption,
        description: row.description,
        keywords: row.keywords,
        textStyle,
        editedFilename: row.edited_filename,
        storagePath: row.storage_path,
        url,
        thumbnail,
        aiModelHistory: (() => { try { return row.ai_model_history ? JSON.parse(row.ai_model_history) : null; } catch { return null; } })()
      };

      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, photo });
    } catch (err) {
        logger.error('Error in GET /photos/:id', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /photos/:id/thumbnail-url
   * Generate a signed, time-limited URL for accessing a photo's thumbnail
   * 
   * Security:
   * - Requires authentication via Bearer token
   * - Validates photo ownership
   * - Returns signed URL valid for DEFAULT_TTL_SECONDS (15 minutes)
   * - Signed URL can be used in <img> tags without additional auth
   * 
   * Response:
   * {
   *   success: true,
   *   url: "/display/thumbnails/{hash}.jpg?sig=...&exp=...",
   *   expiresAt: 1234567890  // Unix timestamp
   * }
   */
  router.get('/:id/thumbnail-url', authenticateToken, async (req, res) => {
    const reqId = req.id || req.headers['x-request-id'] || 'unknown';
    
    try {
      const { id } = req.params;
      
      // Fetch photo and verify ownership
      const photo = await db('photos')
        .where({ id, user_id: req.user.id })
        .select('id', 'hash', 'filename')
        .first();

      if (!photo) {
        logger.warn('Thumbnail URL request for non-existent or unauthorized photo', {
          reqId,
          photoId: id,
          userId: req.user.id
        });
        return res.status(404).json({
          success: false,
          error: 'Photo not found'
        });
      }

      // Verify thumbnail exists (hash must be present)
      if (!photo.hash) {
        logger.warn('Thumbnail URL request for photo without hash', {
          reqId,
          photoId: id,
          filename: photo.filename
        });
        return res.status(404).json({
          success: false,
          error: 'Thumbnail not available'
        });
      }

      // Generate signed URL parameters
      const { sig, exp } = signThumbnailUrl(photo.hash, DEFAULT_TTL_SECONDS);
      
      // Construct full signed URL
      const signedUrl = `/display/thumbnails/${photo.hash}.jpg?sig=${encodeURIComponent(sig)}&exp=${exp}`;

      logger.info('Generated signed thumbnail URL', {
        reqId,
        photoId: id,
        userId: req.user.id,
        expiresAt: new Date(exp * 1000).toISOString()
      });

      return res.json({
        success: true,
        url: signedUrl,
        expiresAt: exp
      });

    } catch (err) {
      logger.error('Error generating thumbnail URL', {
        reqId,
        photoId: req.params.id,
        userId: req.user?.id,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  router.patch('/:id/metadata', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      const row = await db('photos').where({ id, user_id: req.user.id }).select('caption', 'description', 'keywords', 'text_style').first();
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      const { caption, description, keywords, textStyle } = req.body || {};
      if (
        caption === undefined &&
        description === undefined &&
        keywords === undefined &&
        textStyle === undefined
      ) {
        return res.status(400).json({ success: false, error: 'No metadata fields provided' });
      }

      const newCaption = caption !== undefined ? caption : row.caption;
      const newDescription = description !== undefined ? description : row.description;
      const newKeywords = keywords !== undefined ? keywords : row.keywords;
      const newTextStyleJson = textStyle === undefined
        ? row.text_style
        : textStyle === null
          ? null
          : JSON.stringify(textStyle);

      await db('photos').where({ id, user_id: req.user.id }).update({
        caption: newCaption,
        description: newDescription,
        keywords: newKeywords,
        text_style: newTextStyleJson,
        updated_at: new Date().toISOString()
      });

      let parsedTextStyle = null;
      if (newTextStyleJson) {
        try {
          parsedTextStyle = JSON.parse(newTextStyleJson);
  } catch { logger.warn('Failed to parse text_style after update for photo', id); }
      }

      res.json({
        success: true,
        metadata: {
          caption: newCaption,
          description: newDescription,
          keywords: newKeywords,
          textStyle: parsedTextStyle,
        }
      });
    } catch (error) {
      logger.error('Failed to update metadata for photo', id, error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update metadata' });
    }
  });

  // --- Revert edited image endpoint ---
  router.patch('/:id/revert', authenticateToken, express.json(), async (req, res) => {
    const { id } = req.params;
    try {
      const row = await db('photos').where({ id, user_id: req.user.id }).first();
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }
      if (!row.edited_filename) {
        return res.status(400).json({ success: false, error: 'No edited version to revert' });
      }
      
      // Delete edited file from Supabase Storage
      const editedPath = `inprogress/${row.edited_filename}`;
      const { error: deleteError } = await supabase.storage
        .from('photos')
        .remove([editedPath]);
      
      if (deleteError) {
        logger.warn('Failed to delete edited file from Supabase storage:', deleteError);
      }

      await db('photos').where({ id, user_id: req.user.id }).update({ edited_filename: null });
      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to revert photo', id, error);
      res.status(500).json({ success: false, error: error.message || 'Failed to revert' });
    }
  });

  // --- Delete photo endpoint ---
  router.delete('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db('photos').where({ id, user_id: req.user.id }).first();
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      // Delete the file from Supabase Storage
      const filePath = row.storage_path || `${row.state}/${row.filename}`;
      const { error: deleteError } = await supabase.storage
        .from('photos')
        .remove([filePath]);

      if (deleteError) {
        logger.warn('Failed to delete file from Supabase storage:', deleteError);
        // Continue with database deletion even if storage deletion fails
      }

      // Also delete any edited version
      if (row.edited_filename) {
        const editedPath = `inprogress/${row.edited_filename}`;
        const { error: editedDeleteError } = await supabase.storage
          .from('photos')
          .remove([editedPath]);
        
        if (editedDeleteError) {
          logger.warn('Failed to delete edited file from Supabase storage:', editedDeleteError);
        }
      }

      // Delete thumbnail from Supabase Storage
      if (row.hash) {
        const thumbnailPath = `thumbnails/${row.hash}.jpg`;
        const { error: thumbDeleteError } = await supabase.storage
          .from('photos')
          .remove([thumbnailPath]);
        
        if (thumbDeleteError) {
          logger.warn('Failed to delete thumbnail from Supabase storage:', thumbDeleteError);
        }
      }

      // Delete from database
      await db('photos').where({ id, user_id: req.user.id }).del();
      res.json({ success: true, message: 'Photo deleted successfully' });
    } catch (err) {
      logger.error('Delete photo error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  router.patch('/:id/state', authenticateToken, express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const { state } = req.body;
      if (!['working', 'inprogress', 'finished'].includes(state)) {
        return res.status(400).json({ success: false, error: 'Invalid state' });
      }
      const row = await db('photos').where({ id, user_id: req.user.id }).first();
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      // Construct current and new storage paths
      const currentPath = row.storage_path || `${row.state}/${row.filename}`;
      const newPath = `${state}/${row.filename}`;

      // Move file in Supabase Storage if the state is actually changing
      if (row.state !== state) {
        // Step 1: Lock - Update DB to PENDING_MOVE
        await db('photos')
          .where({ id, user_id: req.user.id })
          .update({ state_transition_status: 'PENDING_MOVE' });

        // Log the paths for debugging
        logger.info('[Supabase MOVE] currentPath:', currentPath, 'newPath:', newPath);

        const { data: _data, error: moveErrorInitial } = await supabase.storage
          .from('photos')
          .move(currentPath, newPath);

        // Use a mutable variable so we can clear the error after handling
        // special cases (e.g. destination already exists) to skip fallback logic.
        let moveError = moveErrorInitial;

        if (moveError) {
          // Format and log the storage error for easier debugging
          const formattedError = formatStorageError(moveError);
          logger.error('Supabase move error:', formattedError);

          // Attempt a safe fallback when the source object is missing or move
          // cannot complete. This will try to download the source and upload it
          // to the new path, then remove the original. This recovers from
          // inconsistent storage state (e.g. when db.storage_path points to a
          // file that isn't present under the expected key).
          const errMsg = formattedError.message || '';
          const notFound = formattedError.status === 404 || /not found|no such file|no such object/i.test(errMsg);
          const alreadyExists = /resource already exists|already exists|file already exists/i.test(errMsg);

          // If the destination already exists, treat the move as successful
          // from an application perspective: remove the source (best-effort)
          // and continue to update the database record.
          if (alreadyExists) {
            try {
              const { error: removeErr } = await supabase.storage.from('photos').remove([currentPath]);
              if (removeErr) logger.warn('Failed to remove original after move collision:', removeErr);
              else logger.info('Removed original after move collision:', currentPath);
            } catch (remErr) {
              logger.warn('Error removing original after move collision:', remErr && remErr.message);
            }
            // Clear the move error so downstream logic knows the move was
            // handled and skips the 'not found' fallback path.
            moveError = null;
            // fall through to DB update
          } else if (!notFound) {
            // Step 4: Rollback (failed)
            await db('photos')
              .where({ id, user_id: req.user.id })
              .update({ state_transition_status: 'IDLE' });

            // For non-recoverable errors (permissions, network), return 500 with details
            const payload = { success: false, error: errMsg || 'Failed to move file in storage' };
            if (INCLUDE_ERROR_DETAILS) payload.error_details = formattedError;
            return res.status(500).json(payload);
          }

          // At this point we believe the source may be missing and only then
          // should we attempt the fallback copy from storage. If the error was
          // a destination-collision ('already exists'), the branch above will
          // have handled cleanup and we should NOT attempt this fallback.
          // Only attempt the fallback copy when the move error still indicates
          // the source was not found. If we cleared moveError above (alreadyExists
          // case), skip this fallback entirely.
          if (notFound && moveError) {
            logger.warn('Supabase move failed, attempting fallback copy. source=', currentPath, 'dest=', newPath, 'err=', errMsg);

            try {
              // Try to download the source object
              const { data: downloadData, error: downloadError } = await supabase.storage
                .from('photos')
                .download(currentPath);

              if (downloadError) {
                // Step 4: Rollback (failed)
                await db('photos')
                  .where({ id, user_id: req.user.id })
                  .update({ state_transition_status: 'IDLE' });

                const formattedDownloadErr = formatStorageError(downloadError);
                logger.error('Fallback download failed for', currentPath, formattedDownloadErr);
                const payload = { success: false, error: formattedDownloadErr.message || 'Failed to download source during fallback' };
                if (INCLUDE_ERROR_DETAILS) payload.error_details = formattedDownloadErr;
                return res.status(500).json(payload);
              }

              // Convert Blob to Stream to avoid loading entire file into memory
              // Supabase returns a Blob; we create a Readable stream from it
              const stream = Readable.from(downloadData.stream());

              // Infer content type from extension
              const ext = path.extname(currentPath).toLowerCase();
              let contentType = 'application/octet-stream';
              if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
              else if (ext === '.png') contentType = 'image/png';
              else if (ext === '.gif') contentType = 'image/gif';
              else if (ext === '.heic' || ext === '.heif') contentType = 'image/heic';

              // Upload to the new path (use upsert to be tolerant)
              // Supabase upload() accepts Readable streams
              const { data: _uploadData, error: uploadError } = await supabase.storage
                .from('photos')
                .upload(newPath, stream, {
                  contentType,
                  upsert: true,
                  duplex: 'half'
                });

              if (uploadError) {
                // Step 4: Rollback (failed)
                await db('photos')
                  .where({ id, user_id: req.user.id })
                  .update({ state_transition_status: 'IDLE' });

                const formattedUploadErr = formatStorageError(uploadError);
                logger.error('Fallback upload failed for', newPath, formattedUploadErr);
                const payload = { success: false, error: formattedUploadErr.message || 'Failed to upload during fallback' };
                if (INCLUDE_ERROR_DETAILS) payload.error_details = formattedUploadErr;
                return res.status(500).json(payload);
              }

              // Try to remove the original if it exists (best-effort)
              try {
                const { error: removeErr } = await supabase.storage.from('photos').remove([currentPath]);
                if (removeErr) logger.warn('Failed to remove original after fallback copy:', removeErr);
              } catch (remErr) {
                logger.warn('Error removing original after fallback copy:', remErr && remErr.message);
              }

              logger.info('Fallback copy succeeded for', currentPath, '->', newPath);
              // fall-through to database update
            } catch (fallbackErr) {
              // Step 4: Rollback (failed)
              await db('photos')
                .where({ id, user_id: req.user.id })
                .update({ state_transition_status: 'IDLE' });

              const formattedFallbackErr = formatStorageError(fallbackErr);
              logger.error('Fallback copy exception for', currentPath, formattedFallbackErr.message || formattedFallbackErr);
              const payload = { success: false, error: formattedFallbackErr.message || 'Failed fallback copy in storage' };
              if (INCLUDE_ERROR_DETAILS) payload.error_details = formattedFallbackErr;
              return res.status(500).json(payload);
            }
          }
        }
      }

      // Step 3: Commit - Update DB with new state and IDLE
      await db('photos').where({ id, user_id: req.user.id }).update({ 
        state, 
        storage_path: newPath,
        state_transition_status: 'IDLE',
        updated_at: new Date().toISOString() 
      });

      if (state === 'inprogress') {
        // Always enqueue AI job, never block for synchronous processing
        try {
          await addAIJob(row.id);
          logger.info(`[API] Enqueued AI processing for photoId: ${row.id}`);
        } catch (err) {
          logger.error('Failed to enqueue AI job:', err && err.message);
          // Optionally, return 202 with a warning
        }
        return res.status(202).json({ success: true, status: 'processing', message: 'AI processing has been queued.' });
      }
      res.json({ success: true });
    } catch (err) {
      logger.error('State update error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Save captioned image endpoint ---
  router.post('/save-captioned-image', authenticateToken, async (req, res) => {
    const { photoId, dataURL, caption, description, keywords, textStyle } = req.body || {};
    if (!photoId) return res.status(400).json({ success: false, error: 'photoId is required' });
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) return res.status(400).json({ success: false, error: 'Invalid image dataURL' });

    const dataUrlMatch = dataURL.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!dataUrlMatch) return res.status(400).json({ success: false, error: 'Unsupported data URL format' });
    const base64Data = dataUrlMatch[2];
    let imageBuffer;
    try { imageBuffer = Buffer.from(base64Data, 'base64'); } catch { return res.status(400).json({ success: false, error: 'Unable to decode image data' }); }
    if (!imageBuffer || imageBuffer.length === 0) return res.status(400).json({ success: false, error: 'Image data is empty' });

    try {
      const photoRow = await db('photos').where({ id: photoId, user_id: req.user.id }).first();
      if (!photoRow) return res.status(404).json({ success: false, error: 'Photo not found' });

      // Generate unique edited filename
      const originalExt = path.extname(photoRow.filename);
      const baseName = path.basename(photoRow.filename, originalExt);
      let editedFilename = `${baseName}-edit.jpg`;
      let counter = 1;
      
      // Check if edited filename exists in Supabase Storage
      while (true) {
        const { data: existingFiles } = await supabase.storage
          .from('photos')
          .list('inprogress', { search: editedFilename });
        
        if (!existingFiles || existingFiles.length === 0) {
          break;
        }
        
        editedFilename = `${baseName}-edit-${counter}.jpg`;
        counter++;
      }

      // Save the image buffer as JPEG with rotation applied
      const orientedBuffer = await sharp(imageBuffer).rotate().jpeg({ quality: 90 }).toBuffer();
      
      // Upload edited image to Supabase Storage
      const editedPath = `inprogress/${editedFilename}`;
      const { data: _uploadData, error: uploadError } = await supabase.storage
        .from('photos')
        .upload(editedPath, orientedBuffer, {
          contentType: 'image/jpeg',
          duplex: false
        });

      if (uploadError) {
        logger.error('Supabase upload error for edited image:', uploadError);
        return res.status(500).json({ success: false, error: 'Failed to upload edited image to storage' });
      }

      // Generate metadata from the edited buffer
      let metadata = {};
      try { 
        metadata = await exifr.parse(orientedBuffer, { 
          tiff: true, ifd0: true, exif: true, gps: true, xmp: true, icc: true, iptc: true 
        }) || {}; 
      } catch (metaErr) { 
        logger.warn('Failed to parse metadata for edited image', metaErr && metaErr.message); 
      }

      // Compute hash and update DB
      const crypto = require('crypto');
      const newHash = crypto.createHash('sha256').update(orientedBuffer).digest('hex');
      const now = new Date().toISOString();

      const newCaption = caption !== undefined ? caption : photoRow.caption;
      const newDescription = description !== undefined ? description : photoRow.description;
      const newKeywords = keywords !== undefined ? keywords : photoRow.keywords;
      const newTextStyleJson = textStyle === undefined ? photoRow.text_style : textStyle === null ? null : JSON.stringify(textStyle);

      await db('photos').where({ id: photoId, user_id: req.user.id }).update({
        edited_filename: editedFilename,
        caption: newCaption,
        description: newDescription,
        keywords: newKeywords,
        text_style: newTextStyleJson,
        metadata: JSON.stringify(metadata || {}),
        hash: newHash,
        file_size: orientedBuffer.length,
        storage_path: editedPath,
        updated_at: now
      });

      let parsedTextStyle = null;
      if (newTextStyleJson) {
        try { parsedTextStyle = JSON.parse(newTextStyleJson); } catch { logger.warn('Failed to parse text_style after save for photo', photoId); }
      }

      res.json({
        success: true,
        id: photoId,
        filename: photoRow.filename,
        editedFilename,
        state: photoRow.state,
        caption: newCaption,
        description: newDescription,
        keywords: newKeywords,
        textStyle: parsedTextStyle,
        hash: newHash,
        fileSize: orientedBuffer.length,
        metadata,
        storagePath: editedPath
      });
    } catch (error) {
      logger.error('Failed to save captioned image for photo', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to save captioned image' });
    }
  });

  // --- Run AI processing endpoint ---
  // --- Recheck AI processing endpoint (single-photo) ---
  // This mirrors the behavior of /:id/run-ai but provides a dedicated
  // route for client-side single-photo rechecks.
  router.post('/:id/recheck-ai', authenticateToken, async (req, res) => {
    try {
      // Ensure photo exists
      const photo = await db('photos').where({ id: req.params.id, user_id: req.user.id }).first();
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Always enqueue a job for rechecking AI metadata
      const modelOverride = req.body && req.body.model ? req.body.model : (req.query && req.query.model ? req.query.model : null);
      logger.info('[API] /photos/:id/recheck-ai called', { photoId: photo.id, body: req.body, query: req.query, modelOverride });
      if (modelOverride && !MODEL_ALLOWLIST.includes(modelOverride)) {
        return res.status(400).json({ success: false, error: 'Unsupported model override', allowedModels: MODEL_ALLOWLIST });
      }
      if (modelOverride === 'gpt-image-1') {
        return res.status(400).json({ success: false, error: 'gpt-image-1 is an image-generation model and cannot be used for text analysis. Choose a vision-analysis model (e.g., gpt-4o-mini).' });
      }
      const jobOptions = {};
      if (modelOverride) jobOptions.modelOverrides = { router: modelOverride, scenery: modelOverride, collectible: modelOverride };
      try {
        await addAIJob(photo.id, jobOptions);
        logger.info(`[API] Enqueued AI recheck for photoId: ${photo.id}`);
      } catch (err) {
        logger.error('Failed to enqueue AI recheck job:', err && err.message);
      }
      return res.status(202).json({ message: 'AI recheck queued.', photoId: photo.id });
    } catch (error) {
      logger.error('Error processing AI recheck:', error);
      return res.status(500).json({ error: 'Failed to process AI recheck' });
    }
  });

  router.post('/:id/run-ai', authenticateToken, async (req, res) => {
    try {
      // Re-fetch the photo to ensure it exists
      const photo = await db('photos').where({ id: req.params.id, user_id: req.user.id }).first();
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      let modelOverride = req.body && req.body.model ? req.body.model : (req.query && req.query.model ? req.query.model : null);
      if (modelOverride && !MODEL_ALLOWLIST.includes(modelOverride)) {
        return res.status(400).json({ success: false, error: 'Unsupported model override', allowedModels: MODEL_ALLOWLIST });
      }
      if (modelOverride === 'gpt-image-1') {
        return res.status(400).json({ success: false, error: 'gpt-image-1 is an image-generation model and cannot be used for text analysis. Choose a vision-analysis model (e.g., gpt-4o-mini).' });
      }
      const jobOptions = {};
      if (modelOverride) jobOptions.modelOverrides = { router: modelOverride, scenery: modelOverride, collectible: modelOverride };
      await addAIJob(photo.id, jobOptions);
      logger.info(`[API] Enqueued AI processing for photoId: ${photo.id}`);
      return res.status(202).json({
        message: 'AI processing has been queued.',
        photoId: photo.id,
      });
    } catch (error) {
      logger.error('Error processing AI job:', error);
      return res.status(500).json({ error: 'Failed to process AI job' });
    }
  });

  // --- Display endpoint: Serve images from Supabase Storage ---
  // Use the specialized image authentication middleware which enforces
  // CORS headers and explicitly rejects token-in-query parameters.
  // NOTE: display endpoints were moved to a dedicated router (routes/display.js)
  // to allow display image URLs to be exposed at '/display/*' while keeping
  // the photos API mounted under the '/photos' prefix.
  // For backwards-compatibility when the photos router is mounted at the
  // application root (some tests mount it directly), re-expose the
  // '/display/:state/:filename' route here. When the app mounts a dedicated
  // display router at root, that router will handle '/display/*' in normal
  // server operation; keeping this here avoids breaking tests that mount the
  // photos router standalone.
  router.get('/display/:state/:filename', authenticateImageRequest, async (req, res) => {
    try {
      const { state, filename } = req.params;
      const IMAGE_CACHE_MAX_AGE = parseInt(process.env.IMAGE_CACHE_MAX_AGE, 10) || 86400;

      if (state === 'thumbnails') {
        const storagePath = `thumbnails/${filename}`;
        const { data, error } = await supabase.storage
          .from('photos')
          .download(storagePath);
        if (error) {
          logger.error('❌ Thumbnail download error:', error, { filename });
          return res.status(404).json({ error: 'Thumbnail not found in storage' });
        }
        // Stream the response instead of buffering the entire file
        const stream = Readable.from(data.stream());
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);
        stream.pipe(res);
        return;
      }

      const photo = await db('photos')
        .where(function() {
          this.where({ filename, state })
              .orWhere({ edited_filename: filename, state });
        })
        .andWhere({ user_id: req.user.id })
        .first();

      if (!photo) {
        logger.error('Display endpoint 404: Photo not found', { filename, state });
        return res.status(404).json({ error: 'Photo not found' });
      }

      const storagePath = photo.storage_path || `${state}/${filename}`;
      const { data, error} = await supabase.storage
        .from('photos')
        .download(storagePath);
      if (error) {
        logger.error('Supabase download error:', error, { filename, state });
        return res.status(404).json({ error: 'File not found in storage' });
      }

      // Determine file type to decide streaming vs buffering strategy
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.heic' || ext === '.heif') contentType = 'image/heic';

      let etag = photo.hash || (photo.file_size ? `${photo.file_size}` : '') + (photo.updated_at ? `-${photo.updated_at}` : '');
      if (etag) res.set('ETag', etag);
      res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);

      // HEIC requires buffering for conversion, but all other formats can stream
      if (ext === '.heic' || ext === '.heif') {
        try {
          // HEIC conversion requires the full buffer - acceptable trade-off for this format
          const buffer = await data.arrayBuffer();
          const fileBuffer = Buffer.from(buffer);
          const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer);
          res.set('Content-Type', 'image/jpeg');
          res.send(jpegBuffer);
        } catch (conversionError) {
          logger.error('HEIC conversion error:', conversionError, { filename });
          res.status(500).json({ error: 'Failed to convert HEIC image' });
        }
      } else {
        // Stream the response to avoid memory exhaustion on large files
        const stream = Readable.from(data.stream());
        res.set('Content-Type', contentType);
        stream.pipe(res);
      }

    } catch (err) {
      logger.error('Display endpoint error:', err, { filename: req?.params?.filename });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Debug: list registered routes on the photos router to help diagnose missing endpoints
  try {
    const routes = (router.stack || []).filter(Boolean).map((s) => {
      try { return s.route ? (s.route.path || s.route.stack && s.route.stack[0] && s.route.stack[0].method ? s.route.stack[0].method + ' ' + s.route.path : s.route.path) : (s.name || 'middleware'); } catch { return 'unknown'; }
    });
    logger.info('[routes] photos router routes:', routes);
  } catch (e) {
    logger.warn('[routes] failed to enumerate photos router routes', e && e.message);
  }

  return router;
};

