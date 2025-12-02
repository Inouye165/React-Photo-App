const express = require('express');
const { processAllUnprocessedInprogress, extractLatLon } = require('../ai/service');
const { generateThumbnail } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');

module.exports = function createDebugRouter({ db }) {
  const router = express.Router();

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

  // Debug endpoint to list all inprogress files in the database
  // Authentication required: This endpoint requires a valid JWT token in ALL environments
  // SECURITY: Filter by user_id to prevent information leakage
  router.get('/debug/inprogress', async (req, res) => {
    try {
      const rows = await db('photos').where({ state: 'inprogress', user_id: req.user.id });
      res.json(rows);
    } catch (err) {
      logger.error('Debug inprogress error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Dev endpoint: re-run GPS extraction on a DB row and return coordinates
  // Authentication required: This endpoint requires a valid JWT token in ALL environments
  // SECURITY: Filter by user_id to prevent information leakage
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

  // Debug endpoint to reset ai_retry_count for all HEIC files
  // SECURITY: Filter by user_id to prevent cross-user modifications
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
  // SECURITY: Filter by user_id to prevent processing other users' photos
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
        
        // Check if thumbnail exists in Supabase Storage
        const { data: existingThumbnail } = await supabase.storage
          .from('photos')
          .list('thumbnails', { search: `${row.hash}.jpg` });
        
        if (!existingThumbnail || existingThumbnail.length === 0) {
          missing++;
          
          // Download the original file and generate thumbnail
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
      // Test if we can list files in the bucket
      const { data, error } = await supabase.storage.from('photos').list('', {
        limit: 1
      });
      
      if (error) {
        return res.status(500).json({ success: false, error: error.message, details: error });
      }
      
      // Test if we can create a test file
      const testContent = Buffer.from('test', 'utf8');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('photos')
        .upload('test-file.txt', testContent, {
          contentType: 'text/plain',
          upsert: true
        });
      
      if (uploadError) {
        return res.status(500).json({ 
          success: false, 
          error: uploadError.message, 
          details: uploadError,
          listWorked: true 
        });
      }
      
      // Clean up test file
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