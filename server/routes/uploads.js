const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const exifr = require('exifr');
const { ingestPhoto } = require('../media/image');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

module.exports = function createUploadsRouter({ db }, paths) {
    const { WORKING_DIR, INPROGRESS_DIR, THUMB_DIR } = paths;
  const router = express.Router();

  // Multer setup
  const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, WORKING_DIR); },
    filename: function (req, file, cb) {
      let filename = file.originalname;
      let counter = 1;
      while (fs.existsSync(path.join(WORKING_DIR, filename))) {
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        filename = `${basename}(${counter})${ext}`;
        counter++;
      }
      cb(null, filename);
    }
  });
  const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
      else if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) cb(null, true);
      else cb(new Error('Only image files are allowed'), false);
    }
  });

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