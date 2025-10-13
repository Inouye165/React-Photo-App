const express = require('express');
const { ingestPhoto } = require('../media/image');
const { createUploadMiddleware } = require('../media/uploader');

module.exports = function createUploadsRouter({ db }, paths) {
  const { WORKING_DIR } = paths;
  const router = express.Router();

  // Create upload middleware using centralized configuration
  const upload = createUploadMiddleware(WORKING_DIR);

  // --- Ingest on upload (dedup by hash) ---
  router.post('/upload', upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      const result = await ingestPhoto(db, req.file.path, req.file.filename, 'working');
      if (result.duplicate) {
        return res.json({ success: false, duplicate: true, hash: result.hash, message: 'Duplicate file skipped.' });
      }
      if (result.hash === null) {
        // ingestPhoto failed - clean up the uploaded file
        const fs = require('fs').promises;
        try { await fs.unlink(req.file.path); } catch {}
        return res.status(500).json({ success: false, error: 'Failed to process image file' });
      }
      res.json({ success: true, filename: req.file.filename, hash: result.hash });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to save file' });
    }
  });

  return router;
};