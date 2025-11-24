
const express = require('express');
const path = require('path');
const { convertHeicToJpegBuffer } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const { authenticateImageRequest } = require('../middleware/imageAuth');
const { verifyThumbnailSignature } = require('../utils/urlSigning');
const logger = require('../logger');

module.exports = function createDisplayRouter({ db }) {
  const router = express.Router();

  /**
   * Middleware to handle thumbnail authentication
   * Supports both:
   * 1. Signed URLs (preferred for <img> tags) - no cookie needed
   * 2. Cookie/Bearer token (legacy, backward compatibility)
   * 
   * Only applies to thumbnail requests (state === 'thumbnails')
   */
  function authenticateThumbnailOrImage(req, res, next) {
    const { state, filename } = req.params;
    const { sig, exp } = req.query;
    
    // For thumbnails with signature, validate signature instead of auth
    if (state === 'thumbnails' && sig && exp) {
      // Extract hash from filename
      const hash = filename ? filename.replace(/\.jpg$/i, '') : null;
      
      if (!hash) {
        return res.status(400).json({
          success: false,
          error: 'Invalid filename'
        });
      }

      // Verify signature
      const result = verifyThumbnailSignature(hash, sig, exp);
      
      if (!result.valid) {
        const reqId = req.id || req.headers['x-request-id'] || 'unknown';
        logger.warn('Invalid thumbnail signature', {
          reqId,
          filename,
          reason: result.reason
        });
        return res.status(403).json({
          success: false,
          error: 'Forbidden'
        });
      }
      
      // Signature valid - proceed without user context
      req.user = null; // No user for signed URLs
      return next();
    }
    
    // For all other cases (non-thumbnails, or thumbnails without signature),
    // use cookie/token authentication
    return authenticateImageRequest(req, res, next);
  }

  router.get('/:state/:filename', authenticateThumbnailOrImage, async (req, res) => {
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
        const fileBuffer = Buffer.from(buffer);
        // ETag for thumbnails: use filename (thumbnails are content-addressed by hash)
        const etag = filename;
        res.set('ETag', etag);
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);
        if (req.headers['if-none-match'] && req.headers['if-none-match'] === etag) {
          return res.status(304).end();
        }
        return res.send(fileBuffer);
      }

      // Originals: strict DB lookup (use db('photos') for compatibility)

      if (typeof db !== 'function') {
        logger.error('Display route error', {
          reqId,
          filename,
          state,
          storagePath: null,
          error: 'DB instance is not a function',
          dbType: typeof db,
          stack: null
        });
        return res.status(500).json({ error: 'Internal server error: DB misconfiguration' });
      }

      const photo = await db('photos')
        .where(function () {
          this.where('filename', filename).orWhere('edited_filename', filename);
        })
        .andWhere('state', state)
        .andWhere('user_id', req.user.id)
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

      // ETag header: always set, fallback if hash missing
      let etag = photo.hash;
      if (!etag) {
        // Fallback: file size + updated_at + filename (guaranteed unique per version)
        etag = ((photo.file_size ? String(photo.file_size) : '') + (photo.updated_at ? `-${photo.updated_at}` : '') + `-${filename}`);
      }
      res.set('ETag', etag);
      res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);
      if (req.headers['if-none-match'] && req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

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
