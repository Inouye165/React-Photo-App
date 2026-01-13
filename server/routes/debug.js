const express = require('express');
const { processAllUnprocessedInprogress, extractLatLon } = require('../ai/service');
const { generateThumbnail } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');
// NEW IMPORT: Required for the fix
const { addAIJob } = require('../queue');
const path = require('path');

function buildExistsChecker(storage) {
  return async function exists(storagePath) {
    const normalized = String(storagePath || '').trim();
    if (!normalized) return { exists: false, reason: 'empty_path' };

    // Supabase list() requires directory + search; it does not accept full path.
    const dir = path.posix.dirname(normalized);
    const file = path.posix.basename(normalized);
    try {
      const { data, error } = await storage.from('photos').list(dir === '.' ? '' : dir, { search: file });
      if (error) return { exists: false, reason: error.message || 'list_failed' };
      const found = Array.isArray(data) && data.some((x) => x && x.name === file);
      return { exists: found, reason: found ? 'found' : 'not_found' };
    } catch (err) {
      return { exists: false, reason: err && err.message ? err.message : String(err) };
    }
  };
}

async function enqueueRepairJob(photoId) {
  await addAIJob(photoId, {
    runAiAnalysis: false,
    generateThumbnail: true,
    generateDisplay: true,
  });
}

module.exports = function createDebugRouter({ db }) {
  const router = express.Router();

  // SECURITY: Defense-in-depth guard for operational/debug routes.
  router.use((req, res, next) => {
    const adminToken = process.env.DEBUG_ADMIN_TOKEN;
    if (adminToken && adminToken.trim() !== '') {
      const provided = req.get('x-debug-token');
      if (!provided || provided !== adminToken) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
    }

    return next();
  });

  // ==================================================================
  // NEW MAINTENANCE ROUTE (Added for Collectible Fix)
  // ==================================================================
  const fixCollectiblesHandler = async (req, res) => {
    try {
      logger.info('[Maintenance] Starting collectible repair job via DEBUG...');
      
      // 1. Find collectibles with missing display assets
      const photos = await db('photos')
        .whereNotNull('collectible_id')
        .whereNull('display_path')
        .select('id', 'filename', 'storage_path')
        .limit(100);

      if (photos.length === 0) {
        return res.json({ success: true, count: 0, message: 'No broken collectibles found.' });
      }

      logger.info(`[Maintenance] Found ${photos.length} broken collectibles.`);

      // 2. Enqueue them for processing
      let count = 0;
      for (const p of photos) {
        // Enqueue the job with AI disabled but image generation ENABLED
        await addAIJob(p.id, {
          runAiAnalysis: false,    // Skip expensive AI
          generateThumbnail: true, // Force image processing
          generateDisplay: true
        });
        count++;
      }

      res.json({ 
        success: true, 
        count, 
        message: `Enqueued ${count} photos for repair. Wait 1 minute and refresh.` 
      });

    } catch (err) {
      logger.error('[Maintenance] Repair failed:', err);
      res.status(500).json({ 
        success: false, 
        error: err.message 
      });
    }
  };

  // NOTE: These are GET routes (safe methods) so they do not require CSRF tokens.
  // Debug routes are already protected by JWT auth + optional DEBUG_ADMIN_TOKEN.
  router.get('/fix-collectibles', fixCollectiblesHandler);
  router.get('/debug/fix-collectibles', fixCollectiblesHandler);

  // Repair a specific photo by ID (useful when a single HEIC isn't rendering).
  // Example: GET /debug/repair-photo?id=123
  router.get('/debug/repair-photo', async (req, res) => {
    try {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });

      const photo = await db('photos')
        .where({ id, user_id: req.user.id })
        .select('id')
        .first();

      if (!photo) return res.status(404).json({ success: false, error: 'not found' });

      await enqueueRepairJob(photo.id);
      return res.json({
        success: true,
        message: `Enqueued photo ${photo.id} for repair. Wait ~1 minute and refresh.`,
      });
    } catch (err) {
      logger.error('[Maintenance] /debug/repair-photo failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Diagnose "not linking to Supabase" issues by checking whether the DB paths
  // actually exist in the Supabase Storage bucket.
  // Example: GET /debug/photo-storage-check?id=123
  router.get('/debug/photo-storage-check', async (req, res) => {
    try {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });

      const photo = await db('photos')
        .where({ id, user_id: req.user.id })
        .select('id', 'filename', 'state', 'storage_path', 'display_path', 'updated_at')
        .first();

      if (!photo) return res.status(404).json({ success: false, error: 'not found' });

      const exists = buildExistsChecker(supabase.storage);
      const fallbackPath = `${photo.state}/${photo.filename}`;

      const candidates = Array.from(
        new Set([
          photo.storage_path,
          fallbackPath,
          photo.display_path,
        ].filter(Boolean).map(String))
      );

      const results = {};
      for (const p of candidates) {
        results[p] = await exists(p);
      }

      return res.json({
        success: true,
        photo: {
          id: photo.id,
          filename: photo.filename,
          state: photo.state,
          storage_path: photo.storage_path,
          display_path: photo.display_path,
          updated_at: photo.updated_at,
        },
        checkedPaths: results,
        hint:
          'If storage_path is missing/not_found, the DB is pointing at a non-existent object in Supabase Storage. If display_path is missing, enqueue /debug/repair-photo or run /debug/fix-collectibles for bulk.',
      });
    } catch (err) {
      logger.error('[Debug] /debug/photo-storage-check failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==================================================================
  // EXISTING ROUTES (Preserved)
  // ==================================================================

  // Add endpoint to recheck/reprocess all inprogress files for AI metadata
  router.post('/photos/recheck-inprogress', (req, res) => {
    try {
      logger.info('[RECHECK] /photos/recheck-inprogress endpoint called');
      processAllUnprocessedInprogress(db);
      res.json({ success: true });
    } catch (err) {
      logger.error('[RECHECK] Failed to trigger recheck for inprogress files:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Debug endpoint to list all inprogress files
  router.get('/debug/inprogress', async (req, res) => {
    try {
      const rows = await db('photos').where({ state: 'inprogress', user_id: req.user.id });
      res.json(rows);
    } catch (err) {
      logger.error('Debug inprogress error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Dev endpoint: re-run GPS extraction
  router.get('/dev/reextract-gps', async (req, res) => {
    try {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id is required' });
      const row = await db('photos').where({ id, user_id: req.user.id }).first();
      if (!row) return res.status(404).json({ error: 'not found' });
      const meta = (typeof row.metadata === 'string') ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
      const coords = extractLatLon(meta);
      return res.json({
        id: row.id,
        filename: row.filename,
        source: coords && coords.source,
        lat: coords && coords.lat,
        lon: coords && coords.lon,
        gpsString: (coords && coords.lat != null && coords.lon != null) ? `${coords.lat.toFixed(6)},${coords.lon.toFixed(6)}` : null,
        metaKeys: Object.keys(meta || {})
      });
    } catch (e) {
      logger.error('[dev/reextract-gps] error', e);
      return res.status(500).json({ error: String(e) });
    }
  });

  // Debug endpoint to reset ai_retry_count
  router.post('/debug/reset-ai-retry', async (req, res) => {
    try {
      const result = await db('photos')
        .where('filename', 'like', '%.HEIC')
        .andWhere('user_id', req.user.id)
        .update({ ai_retry_count: 0 });
      res.json({ updated: result });
    } catch (err) {
      logger.error('Reset ai retry error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Debug endpoint to regenerate missing thumbnails
  router.post('/debug/regenerate-thumbnails', async (req, res) => {
    try {
      const rows = await db('photos')
        .whereNotNull('hash')
        .andWhere('user_id', req.user.id);
      
      let missing = 0;
      let generated = 0;
      let failed = 0;
      
      for (const row of rows) {
        const _thumbnailPath = `thumbnails/${row.hash}.jpg`;
        const { data: existingThumbnail } = await supabase.storage
          .from('photos')
          .list('thumbnails', { search: `${row.hash}.jpg` });
        
        if (!existingThumbnail || existingThumbnail.length === 0) {
          missing++;
          const storagePath = row.storage_path || `${row.state}/${row.filename}`;
          const { data: fileData, error } = await supabase.storage
            .from('photos')
            .download(storagePath);
          
          if (error) {
            failed++;
            logger.error(`❌ Failed to download ${row.filename} for thumbnail generation:`, error);
            continue;
          }
          
          try {
            const fileBuffer = await fileData.arrayBuffer();
            await generateThumbnail(Buffer.from(fileBuffer), row.hash);
            generated++;
            logger.info(`✅ Generated thumbnail for ${row.filename}`);
          } catch (genError) {
            failed++;
            logger.error(`❌ Failed to generate thumbnail for ${row.filename}:`, genError.message);
          }
        }
      }
      
      res.json({
        success: true,
        summary: { missing, generated, failed }
      });
    } catch (error) {
      logger.error('Error during thumbnail regeneration:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Test storage connection
  router.get('/storage', async (req, res) => {
    try {
      const { data, error } = await supabase.storage.from('photos').list('', { limit: 1 });
      if (error) return res.status(500).json({ success: false, error: error.message, details: error });
      
      const testContent = Buffer.from('test', 'utf8');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('photos')
        .upload('test-file.txt', testContent, { contentType: 'text/plain', upsert: true });
      
      if (uploadError) return res.status(500).json({ success: false, error: uploadError.message, details: uploadError, listWorked: true });
      
      await supabase.storage.from('photos').remove(['test-file.txt']);
      
      res.json({ 
        success: true, 
        message: 'Storage connection and upload test successful', 
        files: data,
        uploadPath: uploadData.path
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message, stack: err.stack });
    }
  });

  return router;
};