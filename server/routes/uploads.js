const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const exifr = require('exifr');
const { ingestPhoto } = require('../media/image');
const { createUploadMiddleware } = require('../media/uploader');

module.exports = function createUploadsRouter({ db }, paths) {
  const { WORKING_DIR, INPROGRESS_DIR, THUMB_DIR } = paths;
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
      res.json({ success: true, filename: req.file.filename, hash: result.hash });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to save file' });
    }
  });

  return router;
};