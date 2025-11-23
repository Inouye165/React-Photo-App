const express = require('express');
const { ingestPhoto } = require('../media/image');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');
const { validateSafePath } = require('../utils/pathValidator');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

module.exports = function createUploadsRouter({ db }) {
  const router = express.Router();

  // Enforce upload size limit from env (default 10MB)
  const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
  const upload = multer({
    dest: os.tmpdir(), // Use disk storage to prevent RAM OOM
    limits: {
      fileSize: UPLOAD_MAX_BYTES // Configurable upload size limit
    },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      // Accept files with image MIME type or allowed image extensions
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'), false);
      }
    }
  });

  // --- Ingest on upload (upload to Supabase Storage) ---
  router.post('/upload', (req, res, next) => {
    upload.single('photo')(req, res, function (err) {
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: 'File too large' });
      }
      if (err) {
        // Multer file type error or other
        return res.status(415).json({ success: false, error: err.message });
      }
      next();
    });
  }, async (req, res) => {
    let filePath = null;
    let uploadSucceeded = false;
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      // Reject zero-byte files early
      if (typeof req.file.size === 'number' && req.file.size === 0) {
        // Cleanup empty file if it exists
        if (req.file.path) {
          try {
            // Ensure the temp file path is within Multer's configured temp directory
            const tempDir = path.resolve(os.tmpdir());
            const tempFilePath = path.resolve(req.file.path);
            if (!tempFilePath.startsWith(tempDir + path.sep)) {
              throw new Error(`Refusing to delete file outside temp directory: ${tempFilePath}`);
            }
            const realPath = validateSafePath(req.file.path);
            // Use synchronous unlink for immediate cleanup
            try {
              // Check if file exists before attempting to delete it
              if (fs.existsSync(realPath)) {
                fs.unlinkSync(realPath);
              }
            } catch (unlinkErr) {
              if (unlinkErr.code !== 'ENOENT') {
                logger.error('Temp file cleanup failed:', unlinkErr);
              }
            }
          } catch (e) {
            logger.error('Temp file cleanup failed:', e);
          }
        }
        return res.status(400).json({ success: false, error: 'Empty file uploaded' });
      }

      // Generate a unique filename using UUID
      // Strict sanitization: remove any path components and dangerous chars from originalName
      const sanitizedOriginal = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniquePrefix = crypto.randomUUID();
      const filename = `${uniquePrefix}-${sanitizedOriginal}`;
      filePath = `working/${filename}`;

      try {
        // Strict path validation for CodeQL compliance
        let realPath;
        try {
          // Ensure the temp file path is within Multer's configured temp directory
          const tempDir = path.resolve(os.tmpdir());
          const tempFilePath = path.resolve(req.file.path);
          if (!tempFilePath.startsWith(tempDir + path.sep)) {
            throw new Error(`Refusing to read file outside temp directory: ${tempFilePath}`);
          }
          realPath = validateSafePath(req.file.path);
        } catch (err) {
          logger.error('Attempt to read file outside temp dir:', req.file.path, err);
          return res.status(400).json({ success: false, error: 'Unsafe file path for upload' });
        }
        // Create a stream for upload
        const fileStream = fs.createReadStream(realPath);

        const { data: _uploadData, error: uploadError } = await supabase.storage
          .from('photos')
          .upload(filePath, fileStream, {
            contentType: req.file.mimetype,
            duplex: 'half', // Required for streaming uploads
            upsert: false
          });

        if (uploadError) {
          logger.error('Supabase upload error:', uploadError);
          return res.status(500).json({ success: false, error: 'Failed to upload to storage' });
        }
        uploadSucceeded = true;

        // Process the uploaded file (generate metadata, thumbnails, etc.)
        // Pass the local file path instead of buffer
        // Sanitize the file path for CodeQL compliance
        const safeFilename = path.basename(req.file.path);
        const safeDir = os.tmpdir();
        const sanitizedPath = path.join(safeDir, safeFilename);
        const result = await ingestPhoto(db, filePath, filename, 'working', sanitizedPath, req.user.id);

        if (result.duplicate) {
          // Remove the uploaded file since it's a duplicate
          await supabase.storage.from('photos').remove([filePath]);
          return res.json({ success: false, duplicate: true, hash: result.hash, message: 'Duplicate file skipped.' });
        }
        if (result.hash === null) {
          // ingestPhoto failed - clean up the uploaded file
          await supabase.storage.from('photos').remove([filePath]);
          return res.status(500).json({ success: false, error: 'Failed to process image file' });
        }
        res.json({ success: true, filename: filename, hash: result.hash, path: filePath });
      } finally {
        // Always clean up the local temp file
        if (req.file && req.file.path) {
          try {
            // Ensure the temp file path is within Multer's configured temp directory
            const tempDir = path.resolve(os.tmpdir());
            const tempFilePath = path.resolve(req.file.path);
            if (!tempFilePath.startsWith(tempDir + path.sep)) {
              throw new Error(`Refusing to delete file outside temp directory: ${tempFilePath}`);
            }
            const realPath = validateSafePath(req.file.path);
            // Use synchronous unlink to ensure file is deleted before moving to next test
            try {
              // Check if file exists before attempting to delete it
              if (fs.existsSync(realPath)) {
                fs.unlinkSync(realPath);
              }
            } catch (unlinkErr) {
              // File might already be deleted, log but don't fail
              if (unlinkErr.code !== 'ENOENT') {
                logger.error(`Failed to delete temp file ${req.file.path}:`, unlinkErr);
              }
            }
          } catch (e) {
            logger.error(`Path sanitization failed for temp file cleanup: ${req.file.path}`, e);
          }
        }
      }
    } catch (error) {
      logger.error('Upload error:', error);
      // Compensating transaction: delete orphaned file from storage if DB insert fails
      if (filePath && uploadSucceeded) {
        try {
          await supabase.storage.from('photos').remove([filePath]);
          logger.error('Compensating action: Deleted orphaned file from storage due to DB error.');
        } catch (cleanupErr) {
          logger.error('CRITICAL: Failed to delete orphaned file from storage after DB error:', cleanupErr);
        }
      }
      res.status(500).json({ success: false, error: 'Failed to save file' });
    }
  });

  return router;
};