const express = require('express');
const { ingestPhoto } = require('../media/image');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');

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
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      // Reject zero-byte files early
      if (typeof req.file.size === 'number' && req.file.size === 0) {
        // Cleanup empty file if it exists
        if (req.file.path) {
          try {
            const tmpDir = path.resolve(os.tmpdir());
            const candidatePath = path.resolve(req.file.path);
            const realPath = fs.realpathSync(candidatePath);
            if (realPath.startsWith(tmpDir + path.sep)) {
              fs.unlink(realPath, () => {});
            } else {
              logger.warn('Attempted cleanup of file outside temp dir:', realPath);
            }
          } catch (e) {
            logger.error('Temp file cleanup failed:', e);
          }
        }
        return res.status(400).json({ success: false, error: 'Empty file uploaded' });
      }
      
      // Generate unique filename if needed
      let filename = req.file.originalname;
      let counter = 0;
      let uploadedPath = null;
      const ext = path.extname(req.file.originalname);
      const basename = path.basename(req.file.originalname, ext);

      try {
        // Attempt upload loop (atomic check-and-set via upsert: false)
        while (!uploadedPath) {
          if (counter > 0) {
            filename = `${basename}(${counter})${ext}`;
          }
          const filePath = `working/${filename}`;

          // Strict path validation for CodeQL compliance
          const tmpDir = path.resolve(os.tmpdir());
          const candidatePath = path.resolve(req.file.path);
          const realPath = fs.realpathSync(candidatePath);
          if (!realPath.startsWith(tmpDir + path.sep)) {
            logger.error('Attempt to read file outside temp dir:', realPath);
            return res.status(400).json({ success: false, error: 'Unsafe file path for upload' });
          }
          // Create a fresh stream for each attempt
          const fileStream = fs.createReadStream(realPath);

          const { data: _uploadData, error: uploadError } = await supabase.storage
            .from('photos')
            .upload(filePath, fileStream, {
              contentType: req.file.mimetype,
              duplex: 'half', // Required for streaming uploads
              upsert: false
            });

          if (uploadError) {
            // If file exists, increment counter and retry
            // Supabase/PostgREST usually returns 409 Conflict or specific error message for duplicates
            // We check for 'Duplicate' in message or 409 status code
            const isDuplicate = uploadError.statusCode === '409' || 
                                (uploadError.message && (uploadError.message.includes('already exists') || uploadError.message.includes('Duplicate')));
            
            if (isDuplicate) {
              counter++;
              if (counter > 100) {
                 logger.error('Upload failed: too many duplicate filenames');
                 return res.status(409).json({ success: false, error: 'Too many duplicate filenames' });
              }
              continue;
            }

            logger.error('Supabase upload error:', uploadError);
            return res.status(500).json({ success: false, error: 'Failed to upload to storage' });
          }

          uploadedPath = filePath;
        }
        
        const filePath = uploadedPath;
        // Process the uploaded file (generate metadata, thumbnails, etc.)
        // Pass the local file path instead of buffer
        // Sanitize the file path for CodeQL compliance
        const safeFilename = path.basename(req.file.path);
        const safeDir = os.tmpdir();
        const sanitizedPath = path.join(safeDir, safeFilename);
        const result = await ingestPhoto(db, filePath, filename, 'working', sanitizedPath);
        
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
            const tmpDir = path.resolve(os.tmpdir());
            const candidatePath = path.resolve(req.file.path);
            const realPath = fs.realpathSync(candidatePath);
            if (realPath.startsWith(tmpDir + path.sep)) {
              fs.unlink(realPath, (err) => {
                if (err) logger.error(`Failed to delete temp file ${req.file.path}:`, err);
              });
            } else {
              logger.warn('Attempted cleanup of file outside temp dir:', realPath);
            }
          } catch (e) {
            logger.error(`Path sanitization failed for temp file cleanup: ${req.file.path}`, e);
          }
        }
      }
    } catch (error) {
      logger.error('Upload error:', error);
      res.status(500).json({ success: false, error: 'Failed to save file' });
    }
  });

  return router;
};