const express = require('express');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');
const { streamToSupabase } = require('../media/streamUploader');
const { addAIJob, checkRedisAvailable } = require('../queue/index');

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
          fieldName: 'photo'
        });
      } catch (err) {
        // Handle specific error types with appropriate HTTP status codes
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ success: false, error: 'File too large' });
        }
        if (err.code === 'INVALID_MIME_TYPE') {
          return res.status(415).json({ success: false, error: err.message });
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

      // Insert minimal record into database
      const now = new Date().toISOString();
      const [insertedPhoto] = await db('photos')
        .insert({
          filename: uploadResult.filename,
          state: 'working',
          hash: uploadResult.hash,
          file_size: uploadResult.size,
          storage_path: storagePath,
          user_id: req.user.id,
          created_at: now,
          updated_at: now,
          // Metadata will be populated by background worker
          metadata: JSON.stringify({ pending: true })
        })
        .returning(['id', 'filename', 'hash', 'storage_path']);

      // Enqueue background job for heavy processing
      // (EXIF extraction, thumbnail generation, AI metadata)
      let jobEnqueued = false;
      try {
        const redisAvailable = await checkRedisAvailable();
        if (redisAvailable) {
          await addAIJob(insertedPhoto.id, {
            processMetadata: true,
            generateThumbnail: true
          });
          jobEnqueued = true;
        }
      } catch (queueErr) {
        // Queue not available - client can trigger processing manually
        logger.warn('Could not enqueue background job:', queueErr.message);
      }

      // Return 202 Accepted (async processing in background)
      // Or 200 OK if no background queue
      const statusCode = jobEnqueued ? 202 : 200;
      res.status(statusCode).json({
        success: true,
        filename: uploadResult.filename,
        hash: uploadResult.hash,
        path: storagePath,
        photoId: insertedPhoto.id,
        processing: jobEnqueued ? 'queued' : 'immediate'
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
