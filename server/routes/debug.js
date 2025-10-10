const express = require('express');
const { processAllUnprocessedInprogress } = require('../ai/service');

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

  return router;
};