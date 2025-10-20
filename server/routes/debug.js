const express = require('express');
const { processAllUnprocessedInprogress } = require('../ai/service');
const { generateThumbnail } = require('../media/image');
const path = require('path');
const fs = require('fs');

module.exports = function createDebugRouter({ db }, paths) {
  const { INPROGRESS_DIR } = paths;
  const router = express.Router();

  // Add endpoint to recheck/reprocess all inprogress files for AI metadata
  router.post('/photos/recheck-inprogress', (req, res) => {
    try {
      console.log('[RECHECK] /photos/recheck-inprogress endpoint called');
      processAllUnprocessedInprogress(db, INPROGRESS_DIR);
      res.json({ success: true });
    } catch (err) {
      console.error('[RECHECK] Failed to trigger recheck for inprogress files:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Debug endpoint to list all inprogress files in the database
  router.get('/debug/inprogress', (req, res) => {
    db.all('SELECT * FROM photos WHERE state = ?', ['inprogress'], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // Debug endpoint to reset ai_retry_count for all HEIC files
  router.post('/debug/reset-ai-retry', (req, res) => {
    db.run("UPDATE photos SET ai_retry_count = 0 WHERE filename LIKE '%.HEIC'", function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
  });

  // Debug endpoint to regenerate missing thumbnails
  router.post('/debug/regenerate-thumbnails', async (req, res) => {
    try {
      const { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR, THUMB_DIR } = paths;
      
      const getDir = (state) => {
        switch(state) {
          case 'working': return WORKING_DIR;
          case 'inprogress': return INPROGRESS_DIR;
          case 'finished': return FINISHED_DIR;
          default: return WORKING_DIR;
        }
      };

      const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err); else resolve(rows);
        });
      });

      const rows = await dbAll('SELECT * FROM photos WHERE hash IS NOT NULL');
      
      let missing = 0;
      let generated = 0;
      let failed = 0;
      
      for (const row of rows) {
        const thumbPath = path.join(THUMB_DIR, `${row.hash}.jpg`);
        
        if (!fs.existsSync(thumbPath)) {
          missing++;
          const filePath = path.join(getDir(row.state), row.filename);
          
          if (fs.existsSync(filePath)) {
            try {
              await generateThumbnail(filePath, row.hash, THUMB_DIR);
              generated++;
              console.log(`✅ Generated thumbnail for ${row.filename}`);
            } catch (error) {
              failed++;
              console.error(`❌ Failed to generate thumbnail for ${row.filename}:`, error.message);
            }
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

  return router;
};