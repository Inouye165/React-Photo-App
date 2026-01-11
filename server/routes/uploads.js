const express = require('express');
const path = require('path');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');
const { streamToSupabase } = require('../media/streamUploader');
const { addAIJob, checkRedisAvailable } = require('../queue/index');
const { extractMetadata } = require('../media/backgroundProcessor');
const { sanitizePhotoMetadata } = require('../media/metadataSanitizer');
// Cache invalidation uses invalidatePhotosListCacheForUserId from ../lib/redis

function sanitizeOriginalFilename(originalName) {
  const raw = typeof originalName === 'string' ? originalName : '';
  const base = path.posix.basename(raw.replace(/\\/g, '/'));
  const trimmed = base.trim().slice(0, 180) || 'upload';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Streaming uploads router.
 * 
 * This router handles photo uploads by streaming multipart data directly
 * to Supabase Storage without writing to the local filesystem.
 * 
 * Architecture:
 * 1. Request arrives with multipart/form-data
 * 2. Busboy parses the stream and validates MIME type + size
 * 3. File data is piped directly to Supabase Storage
 * 4. Hash is calculated during streaming (not after)
 * 5. Metadata (filename, hash, path) is inserted into database
 * 6. Background job is enqueued for heavy processing (EXIF, thumbnails)
 * 7. Response returned immediately (202 Accepted for async, 200 for sync)
 * 
 * Benefits:
 * - Zero disk I/O (no os.tmpdir() usage)
 * - Memory efficient (streaming, no full file buffering)
 * - Faster response times (heavy processing is async)
 * - Scales horizontally (stateless)
 */

module.exports = function createUploadsRouter({ db }) {
  const router = express.Router();

  // Enforce upload size limit from env (default 10MB)
  const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);

  /**
   * POST /upload
   * 
   * Streams photo directly to Supabase Storage, then enqueues
   * a background job for EXIF extraction and thumbnail generation.
   * 
   * Returns 202 Accepted with job info (if queue available), 
   * or 200 OK with immediate processing result.
   */
  router.post('/upload', async (req, res) => {
    let storagePath = null;
    let uploadSucceeded = false;
    let photoId = null;
    let collectibleId = null;

    try {
      // Auth check
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // Stream the upload directly to Supabase
      let uploadResult;
      try {
        uploadResult = await streamToSupabase(req, {
          maxFileSize: UPLOAD_MAX_BYTES,
          fieldName: 'photo',
          userEmail: req.user.email // Pass user email for scoped hashing
        });
      } catch (err) {
        // Handle specific error types with appropriate HTTP status codes
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ success: false, error: 'File too large' });
        }
        if (err.code === 'INVALID_MIME_TYPE') {
          return res.status(415).json({ success: false, error: err.message });
        }
        if (err.code === 'INVALID_FILE_SIGNATURE') {
          return res.status(415).json({
            success: false,
            error: err.message,
            code: 'INVALID_FILE_SIGNATURE'
          });
        }
        if (err.code === 'NO_FILE') {
          return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        if (err.code === 'EMPTY_FILE') {
          return res.status(400).json({ success: false, error: 'Empty file uploaded' });
        }
        
        logger.error('Stream upload error:', err);
        return res.status(500).json({ success: false, error: 'Failed to upload to storage' });
      }

      storagePath = uploadResult.path;
      uploadSucceeded = true;

      logger.info('[Upload] File streamed to Supabase:', storagePath);

      // Debug: confirm which multipart fields arrived (keys only; avoid logging values).
      try {
        const fieldKeys = uploadResult?.fields && typeof uploadResult.fields === 'object'
          ? Object.keys(uploadResult.fields)
          : [];
        logger.info('[Upload] Multipart fields received:', fieldKeys);
      } catch {
        // ignore logging errors
      }

      // Intent-based uploads: accept a lightweight classification/intent hint
      // from multipart form fields. Default to 'scenery' if missing/invalid.
      // If 'none' is specified, skip AI analysis entirely.
      const rawClassification = uploadResult?.fields?.classification;
      const normalizedClassification = (typeof rawClassification === 'string' ? rawClassification.trim() : '')
        .toLowerCase();
      const validClassifications = ['collectible', 'scenery', 'todo', 'none'];
      const classification = validClassifications.includes(normalizedClassification)
        ? normalizedClassification
        : 'scenery';

      // Check for duplicate by hash
      const existing = await db('photos').where({ hash: uploadResult.hash }).select('id').first();
      if (existing) {
        // Remove the uploaded file since it's a duplicate
        await supabase.storage.from('photos').remove([storagePath]);
        return res.json({ 
          success: false, 
          duplicate: true, 
          hash: uploadResult.hash, 
          message: 'Duplicate file skipped.' 
        });
      }

      // Optional: associate this upload to an existing collectible.
      // Accept from multipart fields (preferred) or query params as a fallback.
      {
        const rawCollectibleId =
          uploadResult?.fields?.collectibleId ??
          uploadResult?.fields?.collectible_id ??
          req.query?.collectibleId ??
          req.query?.collectible_id;

        const normalizedRaw =
          rawCollectibleId === undefined || rawCollectibleId === null
            ? ''
            : String(rawCollectibleId).trim();

        const parsedCollectibleId =
          normalizedRaw && normalizedRaw !== 'undefined' && normalizedRaw !== 'null'
            ? parseInt(normalizedRaw, 10)
            : null;

        if (parsedCollectibleId !== null) {
          if (!Number.isInteger(parsedCollectibleId) || Number.isNaN(parsedCollectibleId) || parsedCollectibleId <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid collectibleId' });
          }

          // SECURITY: ensure the collectible belongs to the authenticated user.
          const collectible = await db('collectibles')
            .where({ id: parsedCollectibleId, user_id: req.user.id })
            .select('id')
            .first();

          if (!collectible) {
            return res.status(404).json({ success: false, error: 'Collectible not found' });
          }

          collectibleId = parsedCollectibleId;
        }
      }

      // IMMEDIATE EXIF EXTRACTION: Extract metadata right after upload
      // This allows the frontend to display compass direction immediately
      let immediateMetadata = {};
      try {
        // Download the file from Supabase Storage
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from('photos')
          .download(storagePath);

        if (!downloadError && fileBlob) {
          const arrayBuffer = await fileBlob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Extract EXIF metadata (including compass heading)
          immediateMetadata = await extractMetadata(buffer, uploadResult.filename);
          logger.info(`Immediate EXIF extraction for ${uploadResult.filename}:`, {
            hasGPS: !!(immediateMetadata.latitude && immediateMetadata.longitude),
            hasDirection: !!(immediateMetadata.GPSImgDirection || immediateMetadata.GPSDestBearing),
            direction: immediateMetadata.GPSImgDirection || immediateMetadata.GPSDestBearing || null
          });
        }
      } catch (metadataErr) {
        logger.warn('Immediate metadata extraction failed:', metadataErr.message);
        // Continue with upload even if metadata extraction fails
      }

      // Insert record with immediate metadata
      const storeGpsCoords = String(process.env.STORE_GPS_COORDS || '').toLowerCase() === 'true';
      const sanitizedMetadata = sanitizePhotoMetadata(immediateMetadata, { storeGpsCoords });

      const now = new Date().toISOString();
      logger.info('[Upload] Saving to DB. Filename:', uploadResult.filename, 'CollectibleID:', collectibleId);
      const [insertedPhoto] = await db('photos')
        .insert({
          filename: uploadResult.filename,
          state: 'working',
          hash: uploadResult.hash,
          file_size: uploadResult.size,
          storage_path: storagePath,
          original_path: null,
          original_mime: uploadResult.mimetype || null,
          original_filename: uploadResult.originalname || null,
          original_size_bytes: uploadResult.size || null,
          derivatives_status: 'pending',
          derivatives_error: null,
          user_id: req.user.id,
          created_at: now,
          updated_at: now,
          classification,
          collectible_id: collectibleId || null,
          // Store immediate metadata or mark as pending
          metadata: JSON.stringify(Object.keys(sanitizedMetadata).length > 0 ? sanitizedMetadata : { pending: true })
        })
        .returning(['id', 'filename', 'hash', 'storage_path']);

      photoId = insertedPhoto.id;

      // Move the stored original into a deterministic, export-friendly prefix.
      // This preserves the uploaded bytes unchanged.
      const finalOriginalPath = `original/${String(photoId)}/${sanitizeOriginalFilename(uploadResult.originalname || uploadResult.filename)}`;

      const bucket = supabase.storage.from('photos');

      // Some tests provide a lightweight Supabase mock that doesn't implement `move`.
      // Treat the move as optional: if it's unavailable, keep the upload under `working/`.
      if (typeof bucket.move === 'function') {
        try {
          const moveResult = await bucket.move(storagePath, finalOriginalPath);
          if (moveResult?.error) {
            throw new Error(moveResult.error.message || 'Failed to move original');
          }

          storagePath = finalOriginalPath;
          await db('photos')
            .where({ id: photoId })
            .update({
              storage_path: storagePath,
              original_path: storagePath,
              updated_at: new Date().toISOString(),
            });
        } catch (moveErr) {
          // Compensating transaction: do not leave a row pointing at a temp path.
          try {
            await bucket.remove([storagePath]);
          } catch {
            /* ignore */
          }
          try {
            if (photoId) {
              await db('photos').where({ id: photoId }).del();
            }
          } catch {
            /* ignore */
          }
          throw moveErr;
        }
      } else {
        // Maintain invariants: if we don't move, treat the uploaded path as the original.
        await db('photos')
          .where({ id: photoId })
          .update({
            original_path: storagePath,
            updated_at: new Date().toISOString(),
          });
      }

      // CRITICAL: Invalidate photos:list cache for this user
      // This ensures the frontend immediately sees the new photo without stale cached data.
      // Uses a per-user Redis Set index (no KEYS/SCAN on the hot path).
      {
        const { invalidatePhotosListCacheForUserId } = require('../lib/redis');
        invalidatePhotosListCacheForUserId(req.user.id).then((result) => {
          if (result && result.ok) {
            logger.info('[upload] Cache invalidated', {
              userId: req.user.id,
              keysDeleted: result.keysDeleted,
              photoId,
            });
          }
        });
      }

      // Enqueue background job for heavy processing
      // (EXIF extraction, thumbnail generation, AI metadata)
      // Skip AI analysis if classification is 'none' (user opted out)
      let jobEnqueued = false;
      
      try {
        // CRITICAL: If this upload is attached to a collectible, bypass queue-based processing.
        // These photos are auxiliary and must upload fast.
        if (collectibleId) {
          logger.info('[upload] Skipping background processing (collectible upload)', {
            photoId,
            userId: req.user.id,
            collectibleId,
          });
        } else if (classification !== 'none') {
          const redisAvailable = await checkRedisAvailable();
          
          if (redisAvailable) {
            await addAIJob(insertedPhoto.id, {
              processMetadata: true,
              generateThumbnail: true,
              requestId: req.requestId,
            });
            jobEnqueued = true;
            
            // Transition photo from 'working' to 'inprogress' to signal AI processing has started
            // This ensures client-side polling can track the AI job and update UI accordingly
            await db('photos')
              .where({ id: photoId })
              .update({
                state: 'inprogress',
                updated_at: new Date().toISOString(),
              });
            logger.info('[upload] Photo transitioned to inprogress', { photoId, userId: req.user.id });
          }
        } else {
          // When classification is 'none', user opted out of AI analysis
          // Keep photo in 'working' state so it shows "Queue" badge with "Analyze" button
          // User can manually trigger analysis later if desired
          logger.info('[upload] Photo stays in working state (no AI analysis requested)', { photoId, userId: req.user.id, classification });
        }
      } catch (queueErr) {
        // Queue not available - client can trigger processing manually
        logger.warn('Could not enqueue background job:', queueErr.message);
      }

      // Return 202 Accepted (async processing in background)
      // Or 200 OK if no background queue
      const statusCode = jobEnqueued ? 202 : 200;
      
      // Extract compass direction for easy access
      const compassHeading = immediateMetadata.GPSImgDirection || 
                            immediateMetadata.GPSDestBearing || 
                            null;
      
      res.status(statusCode).json({
        success: true,
        filename: uploadResult.filename,
        hash: uploadResult.hash,
        path: storagePath,
        photoId: insertedPhoto.id,
        processing: jobEnqueued ? 'queued' : 'immediate',
        // Include immediate metadata in response (especially compass direction)
        metadata: {
          ...immediateMetadata,
          compass_heading: compassHeading // Top-level field for easy access
        }
      });

    } catch (error) {
      logger.error('Upload error:', error);

      // Compensating transaction: delete orphaned file from storage
      if (storagePath && uploadSucceeded) {
        try {
          await supabase.storage.from('photos').remove([storagePath]);
          logger.info('Compensating action: Deleted orphaned file from storage due to error.');
        } catch (cleanupErr) {
          logger.error('CRITICAL: Failed to delete orphaned file from storage:', cleanupErr);
        }
      }

      res.status(500).json({ success: false, error: 'Failed to save file' });
    }
  });

  return router;
};
