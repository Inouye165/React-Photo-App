
const express = require('express');
const path = require('path');
const { convertHeicToJpegBuffer } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const { getRedisClient, setRedisValueWithTtl } = require('../lib/redis');
const { authenticateImageRequest } = require('../middleware/imageAuth');
const { verifyThumbnailSignature } = require('../utils/urlSigning');
const logger = require('../logger');

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

function clampSignedUrlTtlSeconds(ttlSeconds) {
  // Supabase signed URL TTL is in seconds.
  // Safety: enforce a sane min/max to avoid accidental long-lived URLs.
  const min = 60;
  const max = 24 * 60 * 60;
  const n = Number(ttlSeconds);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(n, max));
}

function ttlFromExpSeconds(expSeconds) {
  const exp = Number(expSeconds);
  if (!Number.isFinite(exp) || exp <= 0) return 60;
  const ttl = exp - nowEpochSeconds();
  return clampSignedUrlTtlSeconds(ttl);
}

async function getSignedUrlWithCache({ cacheKey, storagePath, ttlSeconds }) {
  const ttl = clampSignedUrlTtlSeconds(ttlSeconds);
  const redis = getRedisClient();

  if (redis && cacheKey) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return cached;
    } catch (err) {
      logger.warn('[CDN Redirect] Redis read failed; proceeding without cache', {
        cacheKey,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  const { data, error } = await supabase.storage.from('photos').createSignedUrl(storagePath, ttl);
  if (error || !data || !data.signedUrl) {
    const message = error && error.message ? error.message : 'Failed to create signed URL';
    throw new Error(message);
  }

  const signedUrl = data.signedUrl;

  if (redis && cacheKey) {
    const cacheTtl = Math.max(1, ttl - 5);
    try {
      await setRedisValueWithTtl(redis, cacheKey, cacheTtl, signedUrl);
    } catch (err) {
      logger.warn('[CDN Redirect] Redis write failed; proceeding without cache', {
        cacheKey,
        error: err && err.message ? err.message : String(err)
      });
    }
  }

  return signedUrl;
}

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

  function isLoopbackRequest(req) {
    const remote = req && req.socket ? req.socket.remoteAddress : undefined;
    const ip = req && req.ip ? req.ip : undefined;
    const candidates = [remote, ip].filter(Boolean).map(String);
    return candidates.some(addr => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1');
  }

  function shouldBypassRedirect(req) {
    // Security: bypassing redirects changes how bytes are served. Keep the
    // escape hatch for local debugging only.
    if (process.env.NODE_ENV === 'production') return false;
    if (!isLoopbackRequest(req)) return false;

    const raw = req && req.query ? req.query.raw : undefined;
    if (raw === '1' || raw === 'true' || raw === true) return true;
    const header = req && req.headers ? req.headers['x-bypass-redirect'] : undefined;
    if (header === '1' || header === 'true') return true;
    return false;
  }

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
    // Default TTL for redirect targets (seconds).
    // Keep short-lived to limit exposure window; browser may cache the redirect briefly.
    const SIGNED_URL_TTL_SECONDS = parseInt(process.env.IMAGE_SIGNED_URL_TTL_SECONDS, 10) || 600;

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

      const originalStoragePath = photo.storage_path || `${photo.state}/${photo.filename}`;
      const originalExt = getOriginalExtension(originalStoragePath, photo.filename);
      const originalIsHeic = isHeicFormat(originalExt);
      const effectiveStoragePath = photo.display_path || originalStoragePath;
      const effectiveExt = getOriginalExtension(effectiveStoragePath, null);
      const bypassRedirect = shouldBypassRedirect(req);

      // If a display asset exists, use it for HEIC/HEIF.
      // This removes request-time conversion after worker processing completes.
      const usingDisplayAsset = Boolean(originalIsHeic && photo.display_path);

      // Non-HEIC: redirect client to short-lived Supabase signed URL (offload bytes)
      if (!bypassRedirect && !originalIsHeic) {
        const cacheKey = `cdn:signed:image:${photoId}:${photo.updated_at || ''}`;

        try {
          const signedUrl = await getSignedUrlWithCache({
            cacheKey,
            storagePath: effectiveStoragePath,
            ttlSeconds: SIGNED_URL_TTL_SECONDS
          });

          res.set('Cache-Control', 'private, max-age=60');
          res.set('X-Redirect-Target', 'supabase-signed');
          return res.redirect(302, signedUrl);
        } catch (err) {
          logger.warn('Display image by ID: signed URL generation failed; falling back to streaming', {
            reqId,
            photoId,
            storagePath: originalStoragePath,
            error: err && err.message ? err.message : String(err)
          });
          // Fall through to streaming fallback.
        }
      }

      // HEIC/HEIF with display asset: redirect/stream the JPEG (no conversion).
      if (originalIsHeic && photo.display_path && !bypassRedirect) {
        const cacheKey = `cdn:signed:image:${photoId}:${photo.updated_at || ''}:display`;
        try {
          const signedUrl = await getSignedUrlWithCache({
            cacheKey,
            storagePath: effectiveStoragePath,
            ttlSeconds: SIGNED_URL_TTL_SECONDS,
          });

          res.set('Cache-Control', 'private, max-age=60');
          res.set('X-Redirect-Target', 'supabase-signed');
          return res.redirect(302, signedUrl);
        } catch (err) {
          logger.warn('Display image by ID: signed URL generation failed for display asset; falling back to streaming', {
            reqId,
            photoId,
            storagePath: effectiveStoragePath,
            error: err && err.message ? err.message : String(err)
          });
          // Fall through to streaming.
        }
      }

      // TEMP fallback:
      // If the original is HEIC/HEIF and display_path is missing, we still do legacy
      // request-time conversion for now. Remove once worker coverage is complete.

      // Stream bytes (raw=1, redirect failure, or HEIC display asset) from the effective path.
      const { data, error } = await supabase.storage.from('photos').download(effectiveStoragePath);

      if (error || !data) {
        logger.error('Display image by ID: storage error', {
          reqId,
          photoId,
          storagePath: effectiveStoragePath,
          error: error ? error.message : 'Not found'
        });
        res.set('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'File not found in storage' });
      }

      const buffer = await data.arrayBuffer();
      const fileBuffer = Buffer.from(buffer);

      // ETag based on content hash where safe.
      // For display assets, the bytes differ from the original HEIC so do not use the original hash.
      const etag = usingDisplayAsset
        ? `${photo.updated_at || ''}-${photoId}-display`
        : (photo.hash || `${photo.file_size || ''}-${photo.updated_at || ''}-${photoId}`);
      res.set('ETag', `"${etag}"`);
      
      // Check If-None-Match for 304 response
      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && (clientEtag === `"${etag}"` || clientEtag === etag)) {
        return res.status(304).end();
      }

      // HEIC/HEIF: Convert to JPEG
      // Since URL has no extension, Content-Type: image/jpeg is accurate
      // and browser cache won't be confused
      if (originalIsHeic && !photo.display_path) {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer, 95);
          res.set('Content-Type', 'image/jpeg');
          // Authenticated media: avoid shared/proxy caching.
          res.set('Cache-Control', 'private, max-age=60');
          return res.send(jpegBuffer);
        } catch (err) {
          logger.error('Display image by ID: HEIC conversion error', {
            reqId,
            photoId,
            storagePath: effectiveStoragePath,
            error: err.message,
            stack: err.stack
          });
          res.set('Cache-Control', 'no-store');
          return res.status(500).json({ error: 'Image conversion failed' });
        }
      }

      // Non-HEIC: Serve with appropriate Content-Type
      res.set('Content-Type', getContentTypeForExtension(effectiveExt || originalExt));
      res.set('Cache-Control', 'private, max-age=60');
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

  /**
   * Chat-shared image route
   *
   * GET /display/chat-image/:roomId/:photoId
   *
   * Authorization rules:
   * - Caller must be authenticated
   * - Caller must be a member of :roomId
   * - The photo must have been shared in that room via a message row
   * - Defense-in-depth: the shared photo must belong to the message sender
   */
  router.get('/chat-image/:roomId/:photoId', authenticateImageRequest, async (req, res) => {
    const reqId = req.id || req.headers['x-request-id'] || null;
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');

    const { roomId, photoId } = req.params;
    const SIGNED_URL_TTL_SECONDS = parseInt(process.env.CHAT_IMAGE_SIGNED_URL_TTL_SECONDS, 10) || 600;

    try {
      if (typeof db !== 'function') {
        logger.error('Chat display route error', {
          reqId,
          roomId,
          photoId,
          error: 'DB instance is not a function',
          dbType: typeof db
        });
        return res.status(500).json({ error: 'Internal server error: DB misconfiguration' });
      }

      // Chat membership + message linkage live in Supabase (and may not exist in the app DB).
      // Use the server Supabase client (service role) to authorize chat media access.
      const { data: membership, error: membershipError } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId)
        .eq('user_id', req.user.id)
        .maybeSingle();

      if (membershipError) {
        logger.error('Chat display image: membership lookup failed', {
          reqId,
          roomId,
          userId: req.user?.id,
          error: membershipError.message,
        });
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!membership) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { data: messageRow, error: messageError } = await supabase
        .from('messages')
        .select('id, room_id, sender_id, photo_id, created_at')
        .eq('room_id', roomId)
        .eq('photo_id', photoId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (messageError) {
        logger.error('Chat display image: message lookup failed', {
          reqId,
          roomId,
          photoId,
          error: messageError.message,
        });
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!messageRow) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Fetch photo metadata from app DB and enforce that the photo belongs to the sender.
      const sharedPhoto = await db('photos')
        .where('id', photoId)
        .first();

      if (!sharedPhoto) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      if (String(sharedPhoto.user_id) !== String(messageRow.sender_id)) {
        // Defense-in-depth: a message can only reference the sender's own photo.
        return res.status(404).json({ error: 'Photo not found' });
      }

      const originalStoragePath = sharedPhoto.storage_path || `${sharedPhoto.state}/${sharedPhoto.filename}`;
      const originalExt = getOriginalExtension(originalStoragePath, sharedPhoto.filename);
      const originalIsHeic = isHeicFormat(originalExt);
      const effectiveStoragePath = sharedPhoto.display_path || originalStoragePath;
      const bypassRedirect = shouldBypassRedirect(req);

      const usingDisplayAsset = Boolean(originalIsHeic && sharedPhoto.display_path);

      // Non-HEIC: redirect to signed URL (offload bytes)
      if (!bypassRedirect && !originalIsHeic) {
        const cacheKey = `cdn:signed:chat:${roomId}:${photoId}:${sharedPhoto.updated_at || ''}`;
        try {
          const signedUrl = await getSignedUrlWithCache({
            cacheKey,
            storagePath: originalStoragePath,
            ttlSeconds: SIGNED_URL_TTL_SECONDS
          });
          res.set('Cache-Control', 'private, max-age=60');
          res.set('X-Redirect-Target', 'supabase-signed');
          return res.redirect(302, signedUrl);
        } catch (err) {
          logger.warn('Chat display image: signed URL generation failed; falling back to streaming', {
            reqId,
            roomId,
            photoId,
            storagePath: originalStoragePath,
            error: err && err.message ? err.message : String(err)
          });
          // Fall through to streaming.
        }
      }

      // HEIC/HEIF with display asset: redirect/stream the JPEG (no conversion).
      if (originalIsHeic && sharedPhoto.display_path && !bypassRedirect) {
        const cacheKey = `cdn:signed:chat:${roomId}:${photoId}:${sharedPhoto.updated_at || ''}:display`;
        try {
          const signedUrl = await getSignedUrlWithCache({
            cacheKey,
            storagePath: effectiveStoragePath,
            ttlSeconds: SIGNED_URL_TTL_SECONDS,
          });
          res.set('Cache-Control', 'private, max-age=60');
          res.set('X-Redirect-Target', 'supabase-signed');
          return res.redirect(302, signedUrl);
        } catch (err) {
          logger.warn('Chat display image: signed URL generation failed for display asset; falling back to streaming', {
            reqId,
            roomId,
            photoId,
            storagePath: effectiveStoragePath,
            error: err && err.message ? err.message : String(err)
          });
          // Fall through to streaming.
        }
      }

      // TEMP fallback:
      // If the original is HEIC/HEIF and display_path is missing, we still do legacy
      // request-time conversion for now. Remove once worker coverage is complete.

      const { data, error } = await supabase.storage.from('photos').download(effectiveStoragePath);

      if (error || !data) {
        logger.error('Chat display image: storage error', {
          reqId,
          roomId,
          photoId,
          storagePath: effectiveStoragePath,
          error: error ? error.message : 'Not found'
        });
        res.set('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'File not found in storage' });
      }

      const buffer = await data.arrayBuffer();
      const fileBuffer = Buffer.from(buffer);

      const etag = usingDisplayAsset
        ? `${sharedPhoto.updated_at || ''}-${photoId}-display`
        : (sharedPhoto.hash || `${sharedPhoto.file_size || ''}-${sharedPhoto.updated_at || ''}-${photoId}`);
      res.set('ETag', `"${etag}"`);

      const clientEtag = req.headers['if-none-match'];
      if (clientEtag && (clientEtag === `"${etag}"` || clientEtag === etag)) {
        return res.status(304).end();
      }

      if (originalIsHeic && !sharedPhoto.display_path) {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer, 95);
          res.set('Content-Type', 'image/jpeg');
          res.set('Cache-Control', 'private, max-age=60');
          return res.send(jpegBuffer);
        } catch (err) {
          logger.error('Chat display image: HEIC conversion error', {
            reqId,
            roomId,
            photoId,
            storagePath: effectiveStoragePath,
            error: err.message,
            stack: err.stack
          });
          res.set('Cache-Control', 'no-store');
          return res.status(500).json({ error: 'Image conversion failed' });
        }
      }

      res.set('Content-Type', usingDisplayAsset ? 'image/jpeg' : getContentTypeForExtension(originalExt));
      res.set('Cache-Control', 'private, max-age=60');
      return res.send(fileBuffer);
    } catch (err) {
      logger.error('Chat display image: unexpected error', {
        reqId,
        roomId,
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
    const { sig, exp } = req.query || {};
    // 1-year cache for immutable assets (hashed thumbnails, static images)
    const IMAGE_CACHE_MAX_AGE = parseInt(process.env.IMAGE_CACHE_MAX_AGE, 10) || 31536000;

    try {
      // Handle thumbnail requests
      if (state === 'thumbnails') {
        const hash = filename ? filename.replace(/\.jpg$/i, '') : null;
        const normalizedFilename = filename && filename.toLowerCase().endsWith('.jpg') ? filename : `${hash}.jpg`;
        const storagePath = `thumbnails/${normalizedFilename}`;

        const isSignedThumbnailRequest = Boolean(sig && exp);
        const ttlSeconds = isSignedThumbnailRequest ? ttlFromExpSeconds(exp) : 300;
        const cacheKey = isSignedThumbnailRequest && hash ? `cdn:signed:thumb:${hash}:${exp}` : `cdn:signed:thumb:${normalizedFilename}`;

        try {
          const signedUrl = await getSignedUrlWithCache({
            cacheKey,
            storagePath,
            ttlSeconds
          });

          res.set('Cache-Control', `${isSignedThumbnailRequest ? 'public' : 'private'}, max-age=${ttlSeconds}, immutable`);
          res.set('X-Redirect-Target', 'supabase-signed');
          return res.redirect(302, signedUrl);
        } catch (err) {
          logger.warn('Thumbnail redirect: signed URL generation failed; falling back to streaming', {
            reqId,
            filename,
            storagePath,
            error: err && err.message ? err.message : String(err)
          });
          // Fall back to existing streaming behavior.
        }

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
          res.set('Cache-Control', 'no-store');
          return res.status(404).json({ error: 'Thumbnail not found' });
        }

        const buffer = await data.arrayBuffer();
        const fileBuffer = Buffer.from(buffer);
        const etag = normalizedFilename;
        res.set('ETag', etag);
        res.set('Content-Type', 'image/jpeg');

        res.set('Cache-Control', `${isSignedThumbnailRequest ? 'public' : 'private'}, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`);
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
      res.set('Cache-Control', `public, max-age=${IMAGE_CACHE_MAX_AGE}, immutable`);
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
