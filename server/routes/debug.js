const express = require('express');
const { processAllUnprocessedInprogress } = require('../ai/service');
const { generateThumbnail } = require('../media/image');
const supabase = require('../lib/supabaseClient');

module.exports = function createDebugRouter({ db }) {
  const router = express.Router();

  // Add endpoint to recheck/reprocess all inprogress files for AI metadata
  router.post('/photos/recheck-inprogress', (req, res) => {
    try {
      console.log('[RECHECK] /photos/recheck-inprogress endpoint called');
      processAllUnprocessedInprogress(db);
      res.json({ success: true });
    } catch (err) {
      console.error('[RECHECK] Failed to trigger recheck for inprogress files:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Debug endpoint to list all inprogress files in the database
  router.get('/debug/inprogress', async (req, res) => {
    try {
      const rows = await db('photos').where({ state: 'inprogress' });
      res.json(rows);
    } catch (err) {
      console.error('Debug inprogress error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Debug endpoint to reset ai_retry_count for all HEIC files
  router.post('/debug/reset-ai-retry', async (req, res) => {
    try {
      const result = await db('photos').where('filename', 'like', '%.HEIC').update({ ai_retry_count: 0 });
      res.json({ updated: result });
    } catch (err) {
      console.error('Reset ai retry error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Debug endpoint to regenerate missing thumbnails
  router.post('/debug/regenerate-thumbnails', async (req, res) => {
    try {
      const rows = await db('photos').whereNotNull('hash');
      
      let missing = 0;
      let generated = 0;
      let failed = 0;
      
      for (const row of rows) {
        const thumbnailPath = `thumbnails/${row.hash}.jpg`;
        
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
            console.error(`❌ Failed to download ${row.filename} for thumbnail generation:`, error);
            continue;
          }
          
          try {
            const fileBuffer = await fileData.arrayBuffer();
            await generateThumbnail(Buffer.from(fileBuffer), row.hash);
            generated++;
            console.log(`✅ Generated thumbnail for ${row.filename}`);
          } catch (genError) {
            failed++;
            console.error(`❌ Failed to generate thumbnail for ${row.filename}:`, genError.message);
          }
        }
      }
      
      res.json({
        success: true,
        summary: { missing, generated, failed }
      });
    } catch (error) {
      console.error('Error during thumbnail regeneration:', error);
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