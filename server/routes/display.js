
const express = require('express');
const path = require('path');
const { convertHeicToJpegBuffer } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const { authenticateImageRequest } = require('../middleware/imageAuth');
const logger = require('../logger');

module.exports = function createDisplayRouter({ db }) {
  const router = express.Router();

  router.get('/display/:state/:filename', authenticateImageRequest, async (req, res) => {
    const reqId = req.id || req.headers['x-request-id'] || null;
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    const { state, filename } = req.params;
    const IMAGE_CACHE_MAX_AGE = parseInt(process.env.IMAGE_CACHE_MAX_AGE, 10) || 86400;

    try {
      // Handle thumbnail requests
      if (state === 'thumbnails') {
        const storagePath = `thumbnails/${filename}`;
        const { data, error } = await supabase.storage.from('photos').download(storagePath);
        if (error || !data) {
          logger.error('Display route error', {
            reqId,
            filename,
            state,
            storagePath,
            error: error ? error.message : 'Not found',
            stack: error ? error.stack : undefined
          });
          return res.status(404).json({ error: 'Thumbnail not found' });
        }
        const buffer = await data.arrayBuffer();
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);
        return res.send(Buffer.from(buffer));
      }

      // Originals: strict DB lookup
      const photo = await db('photos')
        .where(function () {
          this.where('filename', filename).orWhere('edited_filename', filename);
        })
        .andWhere('state', state)
        .first();

      if (!photo) {
        logger.error('Display route error', {
          reqId,
          filename,
          state,
          storagePath: null,
          error: 'Photo not found',
          stack: null
        });
        return res.status(404).json({ error: 'Photo not found' });
      }

      const storagePath = photo.storage_path || `${state}/${filename}`;
      const { data, error } = await supabase.storage.from('photos').download(storagePath);
      if (error || !data) {
        logger.error('Display route error', {
          reqId,
          filename,
          state,
          storagePath,
          error: error ? error.message : 'Not found',
          stack: error ? error.stack : undefined
        });
        return res.status(404).json({ error: 'File not found in storage' });
      }

      const buffer = await data.arrayBuffer();
      const fileBuffer = Buffer.from(buffer);
      const ext = path.extname(filename).toLowerCase();

      // ETag header if hash present
      if (photo.hash) {
        res.set('ETag', photo.hash);
      }
      res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);

      // HEIC/HEIF: always convert to JPEG and serve as image/jpeg
      if (ext === '.heic' || ext === '.heif') {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer);
          res.set('Content-Type', 'image/jpeg');
          return res.send(jpegBuffer);
        } catch (err) {
          logger.error('Display route error', {
            reqId,
            filename,
            state,
            storagePath,
            error: err.message,
            stack: err.stack
          });
          return res.status(500).json({ error: 'Internal server error' });
        }
      }

      // Other types: serve as original
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.bmp') contentType = 'image/bmp';
      else if (ext === '.tiff' || ext === '.tif') contentType = 'image/tiff';

      res.set('Content-Type', contentType);
      return res.send(fileBuffer);
    } catch (err) {
      logger.error('Display route error', {
        reqId,
        filename,
        state,
        storagePath: null,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};
