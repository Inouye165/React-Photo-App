
const express = require('express');
const path = require('path');
const { convertHeicToJpegBuffer } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const { authenticateImageRequest } = require('../middleware/imageAuth');
const { verifyThumbnailSignature } = require('../utils/urlSigning');
const logger = require('../logger');

/**
 * Helper: Determine the original file extension from storage path or filename
 */
function getOriginalExtension(storagePath, filename) {
  const fromPath = storagePath ? path.extname(storagePath).toLowerCase() : '';
  const fromName = filename ? path.extname(filename).toLowerCase() : '';
  return fromPath || fromName || '';
}

/**
 * Helper: Check if extension is HEIC/HEIF format
 */
function isHeicFormat(ext) {
  return ext === '.heic' || ext === '.heif';
}

/**
 * Helper: Get Content-Type for non-HEIC images
 */
function getContentTypeForExtension(ext) {
  const typeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff'
  };
  return typeMap[ext] || 'image/jpeg';
}

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

  /**
   * NEW: ID-based image route (PREVENTS ERR_CACHE_READ_FAILURE)
   * 
   * GET /display/image/:photoId
   * 
   * This route uses photo ID instead of filename, eliminating the URL extension
   * that caused browser cache corruption when Content-Type didn't match.
   * 
   * Architecture:
   * - URL has no extension → browser can't infer content type from URL
   * - Server determines Content-Type based on actual content
   * - HEIC files are converted to JPEG transparently
   * - Response Content-Type is always accurate
   * - Browser cache key is based on URL (no extension conflict)
   * 
   * Why this prevents ERR_CACHE_READ_FAILURE:
   * - Old: /display/working/photo.heic → Content-Type: image/jpeg (MISMATCH!)
   * - New: /display/image/123 → Content-Type: image/jpeg (NO MISMATCH!)
   * 
   * The browser cache associates the response with the URL. When the URL has
   * .heic extension but Content-Type is image/jpeg, some browsers (especially
   * Chromium) get confused when writing to/reading from disk cache.
   */
  router.get('/image/:photoId', authenticateImageRequest, async (req, res) => {
    const reqId = req.id || req.headers['x-request-id'] || null;
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    const { photoId } = req.params;
    const IMAGE_CACHE_MAX_AGE = parseInt(process.env.IMAGE_CACHE_MAX_AGE, 10) || 86400;

    try {
      if (typeof db !== 'function') {
        logger.error('Display route error', {
          reqId,
          photoId,
          error: 'DB instance is not a function',
          dbType: typeof db
        });
        return res.status(500).json({ error: 'Internal server error: DB misconfiguration' });
      }

      // Look up photo by ID and verify ownership
      const photo = await db('photos')
        .where('id', photoId)
        .andWhere('user_id', req.user.id)
        .first();

      if (!photo) {
        logger.warn('Display image by ID: not found or unauthorized', {
          reqId,
          photoId,
          userId: req.user?.id
        });
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Download from storage
      const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;
      const { data, error } = await supabase.storage.from('photos').download(storagePath);
      
      if (error || !data) {
        logger.error('Display image by ID: storage error', {
          reqId,
          photoId,
          storagePath,
          error: error ? error.message : 'Not found'
        });
        return res.status(404).json({ error: 'File not found in storage' });
      }

      const buffer = await data.arrayBuffer();
      const fileBuffer = Buffer.from(buffer);
      const ext = getOriginalExtension(storagePath, photo.filename);

      // ETag based on content hash (guaranteed unique per file version)
      const etag = photo.hash || `${photo.file_size || ''}-${photo.updated_at || ''}-${photoId}`;
      res.set('ETag', `"${etag}"`);
      
      // Check If-None-Match for 304 response
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && (clientEtag === `"${etag}"` || clientEtag === etag)) {
        return res.status(304).end();
      }

      // HEIC/HEIF: Convert to JPEG
      // Since URL has no extension, Content-Type: image/jpeg is accurate
      // and browser cache won't be confused
      if (isHeicFormat(ext)) {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer, 95);
          res.set('Content-Type', 'image/jpeg');
          // Can use normal caching - no URL/Content-Type mismatch!
          res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);
          return res.send(jpegBuffer);
        } catch (err) {
          logger.error('Display image by ID: HEIC conversion error', {
            reqId,
            photoId,
            storagePath,
            error: err.message,
            stack: err.stack
          });
          return res.status(500).json({ error: 'Image conversion failed' });
        }
      }

      // Non-HEIC: Serve with appropriate Content-Type
      res.set('Content-Type', getContentTypeForExtension(ext));
      res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}`);
      return res.send(fileBuffer);

    } catch (err) {
      logger.error('Display image by ID: unexpected error', {
        reqId,
        photoId,
        error: err.message,
        stack: err.stack
      });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Legacy filename-based route (kept for backward compatibility)
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
      // Note: Use private cache + Vary header to avoid ERR_CACHE_READ_FAILURE
      // This occurs because URL says .heic but response is image/jpeg, confusing browser cache
      if (ext === '.heic' || ext === '.heif') {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer, 95);
          res.set('Content-Type', 'image/jpeg');
          // Override cache header for converted content to prevent cache corruption
          // Browser disk cache struggles with URL-extension vs Content-Type mismatch
          res.set('Cache-Control', 'private, no-store');
          res.set('Vary', 'Accept');
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
