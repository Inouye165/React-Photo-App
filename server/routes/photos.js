const express = require('express');
const path = require('path');
const { Readable } = require('stream');
const logger = require('../logger');

// Check that user IDs look like real UUIDs (Supabase format).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const { signThumbnailUrl, DEFAULT_TTL_SECONDS } = require('../utils/urlSigning');
const { addAIJob } = require('../queue');
const createPhotosDb = require('../services/photosDb');
const createPhotosStorage = require('../services/photosStorage');
const createPhotosImage = require('../services/photosImage');
const createPhotosAi = require('../services/photosAi');
const createPhotosState = require('../services/photosState');
// LangChain removed: dynamic allowlist for compatibility
const DYNAMIC_MODEL_ALLOWLIST = [];
const INTERNAL_MODEL_NAMES = ['router', 'scenery', 'collectible'];
const INTERNAL_MODEL_SET = new Set(INTERNAL_MODEL_NAMES);
const FALLBACK_MODEL_ALLOWLIST = ['gpt-4o', 'gpt-4-vision-preview', 'gpt-3.5-turbo', 'gpt-5'];
const MODEL_ALLOWLIST = DYNAMIC_MODEL_ALLOWLIST;

// Start with a default list of models so the API works immediately, even if the dynamic list hasn't loaded yet.
const initialFallback = Array.from(new Set([...FALLBACK_MODEL_ALLOWLIST, ...INTERNAL_MODEL_NAMES]));
DYNAMIC_MODEL_ALLOWLIST.push(...initialFallback);
let LAST_ALLOWLIST_SOURCE = 'seed';
let LAST_ALLOWLIST_UPDATED_AT = new Date().toISOString();

const { authenticateToken } = require('../middleware/auth');
const { authenticateImageRequest } = require('../middleware/imageAuth');
const { checkRedisAvailable } = require('../queue');
const { validateRequest } = require('../validation/validateRequest');
const { photosListQuerySchema, photoIdParamsSchema } = require('../validation/schemas/photos');
const { mapPhotoRowToListDto, mapPhotoRowToDetailDto } = require('../serializers/photos');
const { getRedisClient } = require('../lib/redis');

module.exports = function createPhotosRouter({ db, supabase }) {
  const router = express.Router();
  // Instantiate only inside this function
  const photosDb = createPhotosDb({ db });
  const photosStorage = createPhotosStorage({ storageClient: supabase.storage.from('photos') });
  const photosImage = createPhotosImage({ sharp: require('sharp'), exifr: require('exifr'), crypto: require('crypto') });
  const photosAi = createPhotosAi({ addAIJob, MODEL_ALLOWLIST: [] });
  const photosState = createPhotosState({ db, storage: photosStorage });

  // --- API: Quick status counts for the dashboard ---
  // Counts photos by state (working, finished, etc.) without loading the actual photo data.
  // The frontend uses this to decide which page to show first.
  router.get('/status', authenticateToken, async (req, res) => {
    const reqId = Math.random().toString(36).slice(2, 10);
    try {
      // Make sure the user ID is a valid UUID before running the query.
      // This stops SQL injection if something goes wrong with the auth check.
      const userId = req.user?.id;
      if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
        logger.warn('[photos/status] Invalid user ID format', { reqId, userId: typeof userId });
        return res.status(400).json({ success: false, error: 'Invalid user identifier', reqId });
      }

      const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 10000);

      const counts = await Promise.race([
        db('photos')
          .where('user_id', userId)
          .select('state')
          .count('* as count')
          .groupBy('state'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB query timeout')), DB_QUERY_TIMEOUT_MS)),
      ]);

      // Convert the database rows into a simple object: { working: 5, finished: 10 }
      // Only include states we know about. Ignore anything else.
      const VALID_STATES = ['working', 'inprogress', 'finished', 'error'];
      const result = {
        working: 0,
        inprogress: 0,
        finished: 0,
        error: 0,
        total: 0
      };

      for (const row of counts) {
        const state = row.state;
        const count = Number(row.count) || 0;
        // Skip any weird states that shouldn't be there.
        if (VALID_STATES.includes(state)) {
          result[state] = count;
        }
        result.total += count;
      }

      res.set('Cache-Control', 'no-store');
      res.json({ success: true, ...result });
    } catch (err) {
      // Log the full error here for debugging, but don't send it to the user.
      // Prevents leaking internal details (CWE-209).
      logger.error('[photos/status] DB error', {
        reqId,
        endpoint: '/photos/status',
        error: {
          message: err && err.message,
          code: err && err.code,
          stack: err && err.stack && err.stack.split('\n').slice(0, 3).join(' | ')
        }
      });
      // Return generic error message - do not expose internal error details
      res.status(500).json({ success: false, error: 'Failed to retrieve photo status', reqId });
    }
  });

  // --- API: List all photos and metadata (include hash) ---
  // Router-root: defined here as '/' so mounting at '/photos' results in
  // final path '/photos'.
  router.get('/', authenticateToken, validateRequest({ query: photosListQuerySchema }), async (req, res) => {
    const reqId = Math.random().toString(36).slice(2, 10);
    try {
      const state = req.validated && req.validated.query ? req.validated.query.state : undefined;
      const DEFAULT_LIMIT = 50;
      const limit = (req.validated && req.validated.query && Number.isInteger(req.validated.query.limit))
        ? req.validated.query.limit
        : DEFAULT_LIMIT;
      const cursor = req.validated && req.validated.query ? req.validated.query.cursor : null;

      // CACHING: Check Redis for cached list response
      // Key includes all query params to ensure correctness
      const redis = getRedisClient();
      const cacheKey = `photos:list:${req.user.id}:${state || 'all'}:${limit}:${cursor || 'start'}`;

      if (redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            logger.info('[photos] Cache hit', { reqId, key: cacheKey });
            res.set('X-Cache', 'HIT');
            // Still prevent browser caching, but serve from Redis
            res.set('Cache-Control', 'no-store');
            return res.json(JSON.parse(cached));
          }
        } catch (err) {
          logger.warn('[photos] Cache read error', { error: err.message });
        }
      }
      
      // Protect against long-running DB queries causing the request to hang
      const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS || 10000);

      const listStart = Date.now();
      let rows;
      try {
        rows = await photosDb.listPhotos(req.user.id, state, { 
          timeoutMs: DB_QUERY_TIMEOUT_MS,
          limit,
          cursor
        });
      } catch (err) {
        const message = err && err.message ? String(err.message) : '';
        const isTimeout =
          (err && err.name === 'KnexTimeoutError') ||
          /defined query timeout|query timeout|timeout exceeded/i.test(message);

        if (isTimeout) {
          throw new Error('DB query timeout');
        }
        throw err;
      }

      const listMs = Date.now() - listStart;
      logger.info('[photos] listPhotos_ms', {
        reqId,
        state: state || null,
        limit,
        hasCursor: Boolean(cursor),
        ms: listMs,
      });
      
      // PAGINATION: Detect if there are more results and build next cursor
      let nextCursor = null;
      if (rows.length > limit) {
        rows = rows.slice(0, limit); // Return only requested limit
        
        // Build cursor from last item in this page
        const lastRow = rows[rows.length - 1];
        const cursorObj = {
          created_at: lastRow.created_at,
          id: lastRow.id
        };
        nextCursor = Buffer.from(JSON.stringify(cursorObj), 'utf8').toString('base64url');
      }
      
      // Generate public URLs for each photo using Supabase Storage
      const mapStart = Date.now();
      const photosWithUrls = rows.map((row) => mapPhotoRowToListDto(row, { signThumbnailUrl, ttlSeconds: DEFAULT_TTL_SECONDS }));

      const mapMs = Date.now() - mapStart;
      logger.info('[photos] mapPhotos_ms', {
        reqId,
        ms: mapMs,
        rowCount: Array.isArray(rows) ? rows.length : 0,
      });

      const response = { 
        success: true, 
        userId: req.user.id,
        photos: photosWithUrls,
        nextCursor: nextCursor
      };

      // CACHING: Store in Redis for short duration (micro-caching)
      // 10 seconds is enough to handle thundering herds without complex invalidation
      if (redis) {
        redis.set(cacheKey, JSON.stringify(response), 'EX', 10).catch(err => {
          logger.warn('[photos] Cache write error', { error: err.message });
        });
      }

      // Prevent caching so frontend always gets fresh filtered results
      res.set('Cache-Control', 'no-store');
      res.set('X-Cache', 'MISS');
      
      // PAGINATION: Include nextCursor in response
      res.json(response);
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
  router.get('/:id', authenticateToken, validateRequest({ params: photoIdParamsSchema }), async (req, res) => {
    try {
      const { id } = req.validated.params;
      const row = await photosDb.getPhotoById(id, req.user.id);
      if (!row) return res.status(404).json({ success: false, error: 'Photo not found' });

      const photo = mapPhotoRowToDetailDto(row);

      // Allow browser caching for 60 seconds to reduce load on repeated visits
      res.set('Cache-Control', 'private, max-age=60');
      return res.json({ success: true, photo });
    } catch (err) {
        logger.error('Error in GET /photos/:id', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /photos/:id/original
   * Export/download the original uploaded bytes (no conversion).
   * Returns a short-lived signed storage URL via redirect.
   */
  router.get('/:id/original', authenticateToken, validateRequest({ params: photoIdParamsSchema }), async (req, res) => {
    try {
      const { id } = req.validated.params;

      const row = await db('photos')
        .select(['id', 'user_id', 'original_path', 'storage_path', 'original_filename', 'filename'])
        .where({ id, user_id: req.user.id })
        .first();

      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      const objectPath = row.original_path || row.storage_path;
      if (!objectPath) {
        return res.status(409).json({ success: false, error: 'Original not available' });
      }

      const { data, error } = await supabase.storage.from('photos').createSignedUrl(objectPath, 60);
      if (error || !data?.signedUrl) {
        logger.error('[photos/:id/original] Failed to create signed URL', { photoId: id, error: error?.message });
        return res.status(500).json({ success: false, error: 'Failed to create download URL' });
      }

      const rawName = String(row.original_filename || row.filename || `photo-${row.id}`);
      const baseName = path.posix.basename(rawName.replace(/\\/g, '/')).trim() || `photo-${row.id}`;
      const safeName = baseName.slice(0, 180).replace(/[^a-zA-Z0-9._ -]/g, '_');

      const signedUrl = new URL(data.signedUrl);
      signedUrl.searchParams.set('download', safeName);

      return res.redirect(302, signedUrl.toString());
    } catch (err) {
      logger.error('Error in GET /photos/:id/original', err);
      return res.status(500).json({ success: false, error: 'Original download failed' });
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
   * - 404: Photo not found or not owned by user (auth/ownership failure)
   * - 200 with hasThumbnail=true: Thumbnail available
   *   {
   *     success: true,
   *     url: "/display/thumbnails/{hash}.jpg?sig=...&exp=...",
   *     expiresAt: 1234567890,
   *     hasThumbnail: true
   *   }
   * - 200 with hasThumbnail=false: Photo exists but has no thumbnail yet
   *   {
   *     success: true,
   *     url: null,
   *     expiresAt: null,
   *     hasThumbnail: false
   *   }
   */
  router.get('/:id/thumbnail-url', authenticateToken, async (req, res) => {
    const reqId = req.id || req.headers['x-request-id'] || 'unknown';
    
    try {
      const { id } = req.params;
      
      // Fetch photo and verify ownership
      const photo = await photosDb.getPhotoById(id, req.user.id);

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

      // Check if thumbnail exists (hash must be present)
      if (!photo.hash) {
        logger.debug('Thumbnail URL request for photo without hash (normal case)', {
          reqId,
          photoId: id,
          filename: photo.filename
        });
        return res.status(200).json({
          success: true,
          url: null,
          expiresAt: null,
          hasThumbnail: false
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
        expiresAt: exp,
        hasThumbnail: true
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
      const photo = await photosDb.getPhotoById(id, req.user.id);
      if (!photo) {
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

      const updated = await photosDb.updatePhotoMetadata(id, req.user.id, { caption, description, keywords, textStyle });
      let parsedTextStyle = null;
      if (textStyle !== undefined && textStyle !== null) {
        try { parsedTextStyle = textStyle; } catch { logger.warn('Failed to parse text_style after update for photo', id); }
      }

      res.json({
        success: !!updated,
        metadata: {
          caption: caption !== undefined ? caption : photo.caption,
          description: description !== undefined ? description : photo.description,
          keywords: keywords !== undefined ? keywords : photo.keywords,
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
      const row = await photosDb.getPhotoById(id, req.user.id);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }
      if (!row.edited_filename) {
        return res.status(400).json({ success: false, error: 'No edited version to revert' });
      }
      
      // Delete edited file from Supabase Storage
      const editedPath = `inprogress/${row.edited_filename}`;
      const { error: deleteError } = await photosStorage.deletePhotos([editedPath]);
      
      if (deleteError) {
        logger.warn('Failed to delete edited file from Supabase storage:', deleteError);
      }

      await photosDb.updatePhotoEditedFilename(id, req.user.id, null);
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
      const row = await photosDb.getPhotoById(id, req.user.id);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      // Delete the file from Supabase Storage
      const filePath = row.storage_path || `${row.state}/${row.filename}`;
      const { error: deleteError } = await photosStorage.deletePhotos([filePath]);

      if (deleteError) {
        logger.warn('Failed to delete file from Supabase storage:', deleteError);
        // Continue with database deletion even if storage deletion fails
      }

      // Also delete any edited version
      if (row.edited_filename) {
        const editedPath = `inprogress/${row.edited_filename}`;
        const { error: editedDeleteError } = await photosStorage.deletePhotos([editedPath]);
        
        if (editedDeleteError) {
          logger.warn('Failed to delete edited file from Supabase storage:', editedDeleteError);
        }
      }

      // Delete thumbnail from Supabase Storage
      if (row.hash) {
        const thumbnailPath = `thumbnails/${row.hash}.jpg`;
        const { error: thumbDeleteError } = await photosStorage.deletePhotos([thumbnailPath]);
        
        if (thumbDeleteError) {
          logger.warn('Failed to delete thumbnail from Supabase storage:', thumbDeleteError);
        }
      }

      // Delete from database
      await photosDb.deletePhoto(id, req.user.id);
      res.json({ success: true, message: 'Photo deleted successfully' });
    } catch (err) {
      logger.error('Delete photo error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  // In state transition endpoint
  router.patch('/:id/state', authenticateToken, express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const { state } = req.body;
      if (!['working', 'inprogress', 'finished'].includes(state)) {
        return res.status(400).json({ success: false, error: 'Invalid state' });
      }
      const row = await photosDb.getPhotoById(id, req.user.id);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }
      if (row.state !== state) {
        const result = await photosState.transitionState(row.id, req.user.id, row.state, state, row.filename, row.storage_path);
        if (!result.success) {
          return res.status(500).json({ success: false, error: result.error, error_details: result.error_details });
        }
      }
      // After successful move, enqueue AI job if needed
      if (state === 'inprogress') {
        try {
          await photosAi.enqueuePhotoAiJob(row.id);
        } catch (err) {
          logger.error('Failed to enqueue AI job:', err && err.message);
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
      const photoRow = await photosDb.getPhotoById(photoId, req.user.id);
      if (!photoRow) return res.status(404).json({ success: false, error: 'Photo not found' });
      // Generate unique edited filename
      const originalExt = path.extname(photoRow.filename);
      const baseName = path.basename(photoRow.filename, originalExt);
      let editedFilename = `${baseName}-edit.jpg`;
      let counter = 1;
      
      // Check if edited filename exists in Supabase Storage
      while (true) {
        const { data: existingFiles } = await photosStorage.listPhotos('inprogress', { search: editedFilename });
        
        if (!existingFiles || existingFiles.length === 0) {
          break;
        }
        
        editedFilename = `${baseName}-edit-${counter}.jpg`;
        counter++;
      }

      // Save the image buffer as JPEG with rotation applied
      const orientedBuffer = await photosImage.convertHeicToJpeg(imageBuffer);
      // Upload edited image to Supabase Storage
      const editedPath = `inprogress/${editedFilename}`;
      const { error: uploadError } = await photosStorage.uploadPhoto(editedPath, orientedBuffer, { contentType: 'image/jpeg', duplex: false });
      if (uploadError) {
        logger.error('Supabase upload error for edited image:', uploadError);
        return res.status(500).json({ success: false, error: 'Failed to upload edited image to storage' });
      }
      // Generate metadata from the edited buffer
      let metadata = {};
      try { metadata = await photosImage.extractMetadata(orientedBuffer); } catch (metaErr) { logger.warn('Failed to parse metadata for edited image', metaErr && metaErr.message); }

      // Merge metadata rather than overwriting: preserve existing GPS/date if extraction is incomplete.
      let mergedMetadata = metadata || {};
      try {
        const { mergeMetadataPreservingLocationAndDate } = require('../media/backgroundProcessor');
        const existingMeta = typeof photoRow.metadata === 'string' ? JSON.parse(photoRow.metadata || '{}') : (photoRow.metadata || {});
        mergedMetadata = mergeMetadataPreservingLocationAndDate(existingMeta, metadata);
      } catch (mergeErr) {
        logger.warn('Failed to merge metadata for edited image; falling back to extracted metadata only', mergeErr && mergeErr.message);
      }
      // Compute hash and update DB
      const newHash = photosImage.computeHash(orientedBuffer);
      const now = new Date().toISOString();

      const newCaption = caption !== undefined ? caption : photoRow.caption;
      const newDescription = description !== undefined ? description : photoRow.description;
      const newKeywords = keywords !== undefined ? keywords : photoRow.keywords;
      const newTextStyleJson = textStyle === undefined ? photoRow.text_style : textStyle === null ? null : JSON.stringify(textStyle);

      await photosDb.updatePhoto(photoId, req.user.id, {
        edited_filename: editedFilename,
        caption: newCaption,
        description: newDescription,
        keywords: newKeywords,
        text_style: newTextStyleJson,
        metadata: JSON.stringify(mergedMetadata || {}),
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
        metadata: mergedMetadata,
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
      const photo = await photosDb.getPhotoById(req.params.id, req.user.id);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Re-extract metadata from the photo file first
      try {
        const { downloadFromStorage, extractMetadata, mergeMetadataPreservingLocationAndDate } = require('../media/backgroundProcessor');
        
        logger.info(`Re-extracting metadata for photo ${photo.id} during recheck-ai`);
        
        let buffer;
        let filename = photo.filename;
        
        try {
          buffer = await downloadFromStorage(photo.filename);
        } catch {
          // Try processed version if original fails
          const processedFilename = photo.filename.replace(/\.heic$/i, '.heic.processed.jpg');
          try {
            buffer = await downloadFromStorage(processedFilename);
            filename = processedFilename;
          } catch (err2) {
            logger.warn(`Could not re-extract metadata for photo ${photo.id}: ${err2.message}`);
            // Don't fail the whole recheck if metadata extraction fails
          }
        }

        if (buffer) {
          const metadata = await extractMetadata(buffer, filename);
          if (metadata && Object.keys(metadata).length > 0) {
            let merged;
            try {
              const existing = typeof photo.metadata === 'string' ? JSON.parse(photo.metadata || '{}') : (photo.metadata || {});
              merged = mergeMetadataPreservingLocationAndDate(existing, metadata);
            } catch (mergeErr) {
              logger.warn(`Metadata merge failed for photo ${photo.id} during recheck-ai: ${mergeErr.message}`);
              merged = metadata;
            }
            await photosDb.updatePhoto(photo.id, req.user.id, {
              metadata: JSON.stringify(merged)
            });
            logger.info(`Successfully re-extracted metadata for photo ${photo.id}`);
          }
        }
      } catch (metadataError) {
        logger.warn(`Metadata re-extraction failed for photo ${photo.id}:`, metadataError.message);
        // Continue with AI processing even if metadata extraction fails
      }

      // Always enqueue a job for rechecking AI metadata
      const modelOverride = req.body && req.body.model ? req.body.model : (req.query && req.query.model ? req.query.model : null);
      const collectibleOverride = req.body && req.body.collectibleOverride ? req.body.collectibleOverride : null;
      if (modelOverride && !photosAi.isModelAllowed(modelOverride)) {
        return res.status(400).json({ success: false, error: 'Unsupported model override', allowedModels: MODEL_ALLOWLIST });
      }
      if (modelOverride === 'gpt-image-1') {
        return res.status(400).json({ success: false, error: 'gpt-image-1 is an image-generation model and cannot be used for text analysis. Choose a vision-analysis model (e.g., gpt-4o-mini).' });
      }
      const jobOptions = {};
      if (modelOverride) jobOptions.modelOverrides = { router: modelOverride, scenery: modelOverride, collectible: modelOverride };
      if (collectibleOverride) {
        if (typeof collectibleOverride !== 'object' || typeof collectibleOverride.id !== 'string' || !collectibleOverride.id.trim()) {
          return res.status(400).json({ success: false, error: 'collectibleOverride must be an object with a non-empty string id' });
        }
        jobOptions.collectibleOverride = collectibleOverride;
      }
      try {
        await photosAi.enqueuePhotoAiJob(photo.id, jobOptions);
      } catch (err) {
        logger.error('Failed to enqueue AI recheck job:', err && err.message);
      }
      return res.status(202).json({ message: 'AI recheck queued (metadata re-extracted).', photoId: photo.id });
    } catch (error) {
      logger.error('Error processing AI recheck:', error);
      return res.status(500).json({ error: 'Failed to process AI recheck' });
    }
  });

  // --- Re-extract metadata endpoint ---
  // Re-extracts EXIF metadata from the stored photo file
  router.post('/:id/reextract-metadata', authenticateToken, async (req, res) => {
    try {
      const photo = await photosDb.getPhotoById(req.params.id, req.user.id);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      const { downloadFromStorage, extractMetadata, mergeMetadataPreservingLocationAndDate } = require('../media/backgroundProcessor');
      
      logger.info(`Re-extracting metadata for photo ${photo.id}`);
      
      // Try to download the photo
      let buffer;
      let filename = photo.filename;
      
      try {
        buffer = await downloadFromStorage(photo.filename);
      } catch {
        // Try processed version if original fails
        const processedFilename = photo.filename.replace(/\.heic$/i, '.heic.processed.jpg');
        try {
          buffer = await downloadFromStorage(processedFilename);
          filename = processedFilename;
        } catch (err2) {
          logger.error(`Failed to download photo ${photo.id}:`, err2.message);
          return res.status(500).json({ error: 'Failed to download photo from storage' });
        }
      }

      // Extract metadata
      const metadata = await extractMetadata(buffer, filename);
      
      if (!metadata || Object.keys(metadata).length === 0) {
        return res.status(500).json({ error: 'Failed to extract metadata' });
      }

      // Update database (merge to preserve existing GPS/date if extraction is incomplete)
      let merged;
      try {
        const existing = typeof photo.metadata === 'string' ? JSON.parse(photo.metadata || '{}') : (photo.metadata || {});
        merged = mergeMetadataPreservingLocationAndDate(existing, metadata);
      } catch (mergeErr) {
        logger.warn(`Metadata merge failed for photo ${photo.id} during reextract-metadata: ${mergeErr.message}`);
        merged = metadata;
      }
      await photosDb.updatePhoto(photo.id, req.user.id, {
        metadata: JSON.stringify(merged)
      });

      logger.info(`Successfully re-extracted metadata for photo ${photo.id}`);
      
      return res.status(200).json({
        message: 'Metadata re-extracted successfully',
        photoId: photo.id,
        hasGPS: !!(merged.latitude && merged.longitude),
        hasHeading: !!(merged.GPSImgDirection || merged.GPS?.imgDirection)
      });
    } catch (error) {
      logger.error('Error re-extracting metadata:', error);
      return res.status(500).json({ error: 'Failed to re-extract metadata' });
    }
  });

  router.post('/:id/run-ai', authenticateToken, async (req, res) => {
    try {
      // Re-fetch the photo to ensure it exists
      const photo = await photosDb.getPhotoById(req.params.id, req.user.id);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }
      let modelOverride = req.body && req.body.model ? req.body.model : (req.query && req.query.model ? req.query.model : null);
      if (modelOverride && !photosAi.isModelAllowed(modelOverride)) {
        return res.status(400).json({ success: false, error: 'Unsupported model override', allowedModels: MODEL_ALLOWLIST });
      }
      if (modelOverride === 'gpt-image-1') {
        return res.status(400).json({ success: false, error: 'gpt-image-1 is an image-generation model and cannot be used for text analysis. Choose a vision-analysis model (e.g., gpt-4o-mini).' });
      }
      const jobOptions = {};
      if (modelOverride) jobOptions.modelOverrides = { router: modelOverride, scenery: modelOverride, collectible: modelOverride };
      await photosAi.enqueuePhotoAiJob(photo.id, jobOptions);
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
      // 1-year cache for immutable assets (hashed thumbnails, static images)
      const IMAGE_CACHE_MAX_AGE = parseInt(process.env.IMAGE_CACHE_MAX_AGE, 10) || 31536000;

      if (state === 'thumbnails') {
        const storagePath = `thumbnails/${filename}`;
        const { data, error } = await photosStorage.downloadPhoto(storagePath);
        if (error) {
          logger.error('❌ Thumbnail download error:', error, { filename });
          return res.status(404).json({ error: 'Thumbnail not found in storage' });
        }
        // Stream the response instead of buffering the entire file
        const stream = Readable.from(data.stream());
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`);
        stream.pipe(res);
        return;
      }

      const photo = await photosDb.getPhotoByFilenameAndState(filename, state, req.user.id);

      if (!photo) {
        logger.error('Display endpoint 404: Photo not found', { filename, state });
        return res.status(404).json({ error: 'Photo not found' });
      }

      const storagePath = photo.storage_path || `${state}/${filename}`;
      const { data, error} = await photosStorage.downloadPhoto(storagePath);
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
      res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`);

      // HEIC requires buffering for conversion, but all other formats can stream
      if (ext === '.heic' || ext === '.heif') {
        try {
          // HEIC conversion requires the full buffer - acceptable trade-off for this format
          const buffer = await data.arrayBuffer();
          const fileBuffer = Buffer.from(buffer);
          const jpegBuffer = await photosImage.convertHeicToJpeg(fileBuffer);
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

