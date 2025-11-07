const express = require('express');
const path = require('path');
const { convertHeicToJpegBuffer } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const { authenticateImageRequest } = require('../middleware/imageAuth');
const logger = require('../logger');

module.exports = function createDisplayRouter({ db }) {
  const router = express.Router();

  // Serve images from Supabase Storage. These endpoints are mounted at root
  // (e.g., app.use(createDisplayRouter({db})) ) so they are available as
  // /display/:state/:filename which the frontend uses for image URLs.
  router.get('/display/:state/:filename', authenticateImageRequest, async (req, res) => {
  // Always set this header for all responses
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  try {
      const { state, filename } = req.params;
      const IMAGE_CACHE_MAX_AGE = parseInt(process.env.IMAGE_CACHE_MAX_AGE, 10) || 86400;

      // Handle thumbnail requests (state = "thumbnails")
      if (state === 'thumbnails') {
        const storagePath = `thumbnails/${filename}`;
        const { data, error } = await supabase.storage
          .from('photos')
          .download(storagePath);
        if (error) {
          logger.error('❌ Thumbnail download error:', error, { filename });
          // Header already set above
          return res.status(404).json({ error: 'Thumbnail not found in storage' });
        }
        const buffer = await data.arrayBuffer();
        const fileBuffer = Buffer.from(buffer);
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.send(fileBuffer);
        return;
      }

      // Handle regular photo requests
      const photo = await db('photos')
        .where(function() {
          this.where({ filename, state })
              .orWhere({ edited_filename: filename, state });
        })
        .first();

      if (!photo) {
        logger.error('Display endpoint 404: Photo not found', { filename, state });
        // Header already set above
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Use storage_path if available, otherwise construct from state/filename
      const storagePath = photo.storage_path || `${state}/${filename}`;
      const { data, error } = await supabase.storage
        .from('photos')
        .download(storagePath);
      if (error) {
        logger.error('Supabase download error:', error, { filename, state });
        // Header already set above
        return res.status(404).json({ error: 'File not found in storage' });
      }

      const buffer = await data.arrayBuffer();
      const fileBuffer = Buffer.from(buffer);
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.heic' || ext === '.heif') contentType = 'image/heic';

      // ETag: use photo.hash if available, else fallback to file size + updated_at
      let etag = photo.hash || (photo.file_size ? `${photo.file_size}` : '') + (photo.updated_at ? `-${photo.updated_at}` : '');
      if (etag) res.set('ETag', etag);
      res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);

      // Convert HEIC to JPEG if needed
      if (ext === '.heic' || ext === '.heif') {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer);
          res.set('Content-Type', 'image/jpeg');
          res.set('Cross-Origin-Resource-Policy', 'cross-origin');
          res.send(jpegBuffer);
        } catch (conversionError) {
          logger.error('HEIC conversion error:', conversionError, { filename });
          res.status(500).json({ error: 'Failed to convert HEIC image' });
        }
      } else {
        res.set('Content-Type', contentType);
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.send(fileBuffer);
      }

    } catch (err) {
      logger.error('Display endpoint error:', err, { filename: req?.params?.filename });
      // Header already set above
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
