const express = require('express');
const { ingestPhoto } = require('../media/image');
const multer = require('multer');
const path = require('path');
const supabase = require('../lib/supabaseClient');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

module.exports = function createUploadsRouter({ db }) {
  const router = express.Router();

  // Create upload middleware using memory storage for Supabase
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
      fileSize: 50 * 1024 * 1024 // 50MB limit
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
  router.post('/upload', upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      // Generate unique filename if needed
      let filename = req.file.originalname;
      let counter = 1;
      
      // Check if file exists in Supabase Storage
      while (true) {
        const { data: existingFile } = await supabase.storage
          .from('photos')
          .list('working', { search: filename });
        
        if (!existingFile || existingFile.length === 0) {
          break;
        }
        
        const ext = path.extname(req.file.originalname);
        const basename = path.basename(req.file.originalname, ext);
        filename = `${basename}(${counter})${ext}`;
        counter++;
      }

      // Upload file to Supabase Storage
      const filePath = `working/${filename}`;
      const { data: _uploadData, error: uploadError } = await supabase.storage
        .from('photos')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          duplex: false
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return res.status(500).json({ success: false, error: 'Failed to upload to storage' });
      }

      // Process the uploaded file (generate metadata, thumbnails, etc.)
      const result = await ingestPhoto(db, filePath, filename, 'working', req.file.buffer);
      
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
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ success: false, error: 'Failed to save file' });
    }
  });

  return router;
};