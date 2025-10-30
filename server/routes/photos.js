const express = require('express');
const path = require('path');
const { convertHeicToJpegBuffer } = require('../media/image');
const { updatePhotoAIMetadata } = require('../ai/service');
const { addAIJob, checkRedisAvailable } = require('../queue/index');
const sharp = require('sharp');
const exifr = require('exifr');
const supabase = require('../lib/supabaseClient');
const { authenticateToken } = require('../middleware/auth');
const { authenticateImageRequest } = require('../middleware/imageAuth');

module.exports = function createPhotosRouter({ db }) {
  const router = express.Router();

  // Helper: format storage/external errors into a readable, serializable shape
  const util = require('util');
  const INCLUDE_ERROR_DETAILS = process.env.NODE_ENV !== 'production';
  function formatStorageError(err) {
    if (!err) return { message: 'Unknown error' };
    // Pull common fields
    let message = err.message || err.msg || err.error_description || err.error || (typeof err === 'string' ? err : null);
    // If message is an object, try to stringify it for readability
    if (message && typeof message === 'object') {
      try {
        message = JSON.stringify(message);
      } catch {
        message = util.inspect(message, { depth: 2 });
      }
    }
    const status = err.status || err.statusCode || err.status_code || null;
    const code = err.code || null;

    // Collect a few helpful details without serializing everything (avoid secrets)
    const details = {};
    ['hint', 'details', 'cause', 'path', 'type', 'name'].forEach(k => {
      if (err[k]) details[k] = err[k];
    });

  if (message && message !== '{}' && message !== '[]' && message !== '') return { message, status, code, details };

    // Fall back to a safe util.inspect when there is no obvious message
    try {
      return { message: util.inspect(err, { depth: 2 }), status, code, details };
    } catch {
      return { message: String(err), status, code, details };
    }
  }

  // --- API: List all photos and metadata (include hash) ---
  router.get('/photos', authenticateToken, async (req, res) => {
    try {
      const state = req.query.state;
      let query = db('photos').select('id', 'filename', 'state', 'metadata', 'hash', 'file_size', 'caption', 'description', 'keywords', 'text_style', 'edited_filename', 'storage_path');
      
      if (state === 'working' || state === 'inprogress' || state === 'finished') {
        query = query.where({ state });
      }
      
      const rows = await query;

  // Generate public URLs for each photo using Supabase Storage
      const photosWithUrls = await Promise.all(rows.map(async (row) => {
        let textStyle = null;
        if (row.text_style) {
          try {
            textStyle = JSON.parse(row.text_style);
          } catch (parseErr) {
            console.warn('Failed to parse text_style for photo', row.id, parseErr.message);
          }
        }

  // The frontend will receive fully signed URLs below.

        // Use simple relative paths for images and thumbnails. Image access
        // is protected by httpOnly cookie-based authentication on /display/*.
        let thumbnailUrl = null;
        let photoUrl = null;
        if (row.hash) {
          thumbnailUrl = `/display/thumbnails/${row.hash}.jpg`;
        }
        photoUrl = `/display/${row.state}/${row.filename}`;

        return {
          id: row.id,
          filename: row.filename,
          state: row.state,
          metadata: JSON.parse(row.metadata || '{}'),
          hash: row.hash,
          file_size: row.file_size,
          caption: row.caption,
          description: row.description,
          keywords: row.keywords,
          textStyle,
          editedFilename: row.edited_filename,
          storagePath: row.storage_path,
          url: photoUrl,
          thumbnail: thumbnailUrl
        };
      }));

      // Prevent caching so frontend always gets fresh filtered results
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, photos: photosWithUrls });
    } catch (err) {
      console.error('Error in /photos endpoint:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Metadata update endpoint ---
  // --- Single photo fetch endpoint ---
  router.get('/photos/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db('photos').where({ id }).first();
      if (!row) return res.status(404).json({ success: false, error: 'Photo not found' });

      let textStyle = null;
      if (row.text_style) {
        try { textStyle = JSON.parse(row.text_style); } catch { textStyle = null; }
      }

      // Provide relative image URLs; /display/* is protected by the cookie auth middleware.
      let url = null;
      let thumbnail = null;
      if (row.hash) thumbnail = `/display/thumbnails/${row.hash}.jpg`;
      url = `/display/${row.state}/${row.filename}`;

      const photo = {
        id: row.id,
        filename: row.filename,
        state: row.state,
        metadata: JSON.parse(row.metadata || '{}'),
        hash: row.hash,
        file_size: row.file_size,
        caption: row.caption,
        description: row.description,
        keywords: row.keywords,
        textStyle,
        editedFilename: row.edited_filename,
        storagePath: row.storage_path,
        url,
        thumbnail
      };

      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, photo });
    } catch (err) {
      console.error('Error in GET /photos/:id', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  router.patch('/photos/:id/metadata', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      const row = await db('photos').where('id', id).select('caption', 'description', 'keywords', 'text_style').first();
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      const { caption, description, keywords, textStyle } = req.body || {};
      if (
        caption === undefined &&
        description === undefined &&
        keywords === undefined &&
        textStyle === undefined
      ) {
        return res.status(400).json({ success: false, error: 'No metadata fields provided' });
      }

      const newCaption = caption !== undefined ? caption : row.caption;
      const newDescription = description !== undefined ? description : row.description;
      const newKeywords = keywords !== undefined ? keywords : row.keywords;
      const newTextStyleJson = textStyle === undefined
        ? row.text_style
        : textStyle === null
          ? null
          : JSON.stringify(textStyle);

      await db('photos').where('id', id).update({
        caption: newCaption,
        description: newDescription,
        keywords: newKeywords,
        text_style: newTextStyleJson,
        updated_at: new Date().toISOString()
      });

      let parsedTextStyle = null;
      if (newTextStyleJson) {
        try {
          parsedTextStyle = JSON.parse(newTextStyleJson);
        } catch { console.warn('Failed to parse text_style after update for photo', id); }
      }

      res.json({
        success: true,
        metadata: {
          caption: newCaption,
          description: newDescription,
          keywords: newKeywords,
          textStyle: parsedTextStyle,
        }
      });
    } catch (error) {
      console.error('Failed to update metadata for photo', id, error);
      res.status(500).json({ success: false, error: error.message || 'Failed to update metadata' });
    }
  });

  // --- Revert edited image endpoint ---
  router.patch('/photos/:id/revert', authenticateToken, express.json(), async (req, res) => {
    const { id } = req.params;
    try {
      const row = await db('photos').where('id', id).first();
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }
      if (!row.edited_filename) {
        return res.status(400).json({ success: false, error: 'No edited version to revert' });
      }
      
      // Delete edited file from Supabase Storage
      const editedPath = `inprogress/${row.edited_filename}`;
      const { error: deleteError } = await supabase.storage
        .from('photos')
        .remove([editedPath]);
      
      if (deleteError) {
        console.warn('Failed to delete edited file from Supabase storage:', deleteError);
      }

      await db('photos').where('id', id).update({ edited_filename: null });
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to revert photo', id, error);
      res.status(500).json({ success: false, error: error.message || 'Failed to revert' });
    }
  });

  // --- Delete photo endpoint ---
  router.delete('/photos/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const row = await db('photos').where({ id }).first();
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      // Delete the file from Supabase Storage
      const filePath = row.storage_path || `${row.state}/${row.filename}`;
      const { error: deleteError } = await supabase.storage
        .from('photos')
        .remove([filePath]);

      if (deleteError) {
        console.warn('Failed to delete file from Supabase storage:', deleteError);
        // Continue with database deletion even if storage deletion fails
      }

      // Also delete any edited version
      if (row.edited_filename) {
        const editedPath = `inprogress/${row.edited_filename}`;
        const { error: editedDeleteError } = await supabase.storage
          .from('photos')
          .remove([editedPath]);
        
        if (editedDeleteError) {
          console.warn('Failed to delete edited file from Supabase storage:', editedDeleteError);
        }
      }

      // Delete thumbnail from Supabase Storage
      if (row.hash) {
        const thumbnailPath = `thumbnails/${row.hash}.jpg`;
        const { error: thumbDeleteError } = await supabase.storage
          .from('photos')
          .remove([thumbnailPath]);
        
        if (thumbDeleteError) {
          console.warn('Failed to delete thumbnail from Supabase storage:', thumbDeleteError);
        }
      }

      // Delete from database
      await db('photos').where({ id }).del();
      res.json({ success: true, message: 'Photo deleted successfully' });
    } catch (err) {
      console.error('Delete photo error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
  router.patch('/photos/:id/state', authenticateToken, express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const { state } = req.body;
      const waitForAI = req.query.waitForAI === '1' || req.query.waitForAI === 'true';
      if (!['working', 'inprogress', 'finished'].includes(state)) {
        return res.status(400).json({ success: false, error: 'Invalid state' });
      }
      const row = await db('photos').where({ id }).first();
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      // Construct current and new storage paths
      const currentPath = row.storage_path || `${row.state}/${row.filename}`;
      const newPath = `${state}/${row.filename}`;

      // Move file in Supabase Storage if the state is actually changing
      if (row.state !== state) {
        // Log the paths for debugging
        console.log('[Supabase MOVE] currentPath:', currentPath, 'newPath:', newPath);

        const { data: _data, error: moveErrorInitial } = await supabase.storage
          .from('photos')
          .move(currentPath, newPath);

        // Use a mutable variable so we can clear the error after handling
        // special cases (e.g. destination already exists) to skip fallback logic.
        let moveError = moveErrorInitial;

        if (moveError) {
          // Format and log the storage error for easier debugging
          const formattedError = formatStorageError(moveError);
          console.error('Supabase move error:', formattedError);

          // Attempt a safe fallback when the source object is missing or move
          // cannot complete. This will try to download the source and upload it
          // to the new path, then remove the original. This recovers from
          // inconsistent storage state (e.g. when db.storage_path points to a
          // file that isn't present under the expected key).
          const errMsg = formattedError.message || '';
          const notFound = formattedError.status === 404 || /not found|no such file|no such object/i.test(errMsg);
          const alreadyExists = /resource already exists|already exists|file already exists/i.test(errMsg);

          // If the destination already exists, treat the move as successful
          // from an application perspective: remove the source (best-effort)
          // and continue to update the database record.
          if (alreadyExists) {
            try {
              const { error: removeErr } = await supabase.storage.from('photos').remove([currentPath]);
              if (removeErr) console.warn('Failed to remove original after move collision:', removeErr);
              else console.log('Removed original after move collision:', currentPath);
            } catch (remErr) {
              console.warn('Error removing original after move collision:', remErr && remErr.message);
            }
            // Clear the move error so downstream logic knows the move was
            // handled and skips the 'not found' fallback path.
            moveError = null;
            // fall through to DB update
          } else if (!notFound) {
            // For non-recoverable errors (permissions, network), return 500 with details
            const payload = { success: false, error: errMsg || 'Failed to move file in storage' };
            if (INCLUDE_ERROR_DETAILS) payload.error_details = formattedError;
            return res.status(500).json(payload);
          }

          // At this point we believe the source may be missing and only then
          // should we attempt the fallback copy from storage. If the error was
          // a destination-collision ('already exists'), the branch above will
          // have handled cleanup and we should NOT attempt this fallback.
          // Only attempt the fallback copy when the move error still indicates
          // the source was not found. If we cleared moveError above (alreadyExists
          // case), skip this fallback entirely.
          if (notFound && moveError) {
            console.warn('Supabase move failed, attempting fallback copy. source=', currentPath, 'dest=', newPath, 'err=', errMsg);

            try {
              // Try to download the source object
              const { data: downloadData, error: downloadError } = await supabase.storage
                .from('photos')
                .download(currentPath);

              if (downloadError) {
                const formattedDownloadErr = formatStorageError(downloadError);
                console.error('Fallback download failed for', currentPath, formattedDownloadErr);
                const payload = { success: false, error: formattedDownloadErr.message || 'Failed to download source during fallback' };
                if (INCLUDE_ERROR_DETAILS) payload.error_details = formattedDownloadErr;
                return res.status(500).json(payload);
              }

              const arrayBuffer = await downloadData.arrayBuffer();
              const fileBuffer = Buffer.from(arrayBuffer);

              // Infer content type from extension
              const ext = path.extname(currentPath).toLowerCase();
              let contentType = 'application/octet-stream';
              if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
              else if (ext === '.png') contentType = 'image/png';
              else if (ext === '.gif') contentType = 'image/gif';
              else if (ext === '.heic' || ext === '.heif') contentType = 'image/heic';

              // Upload to the new path (use upsert to be tolerant)
              const { data: _uploadData, error: uploadError } = await supabase.storage
                .from('photos')
                .upload(newPath, fileBuffer, {
                  contentType,
                  upsert: true,
                  duplex: false
                });

              if (uploadError) {
                const formattedUploadErr = formatStorageError(uploadError);
                console.error('Fallback upload failed for', newPath, formattedUploadErr);
                const payload = { success: false, error: formattedUploadErr.message || 'Failed to upload during fallback' };
                if (INCLUDE_ERROR_DETAILS) payload.error_details = formattedUploadErr;
                return res.status(500).json(payload);
              }

              // Try to remove the original if it exists (best-effort)
              try {
                const { error: removeErr } = await supabase.storage.from('photos').remove([currentPath]);
                if (removeErr) console.warn('Failed to remove original after fallback copy:', removeErr);
              } catch (remErr) {
                console.warn('Error removing original after fallback copy:', remErr && remErr.message);
              }

              console.log('Fallback copy succeeded for', currentPath, '->', newPath);
              // fall-through to database update
            } catch (fallbackErr) {
              const formattedFallbackErr = formatStorageError(fallbackErr);
              console.error('Fallback copy exception for', currentPath, formattedFallbackErr.message || formattedFallbackErr);
              const payload = { success: false, error: formattedFallbackErr.message || 'Failed fallback copy in storage' };
              if (INCLUDE_ERROR_DETAILS) payload.error_details = formattedFallbackErr;
              return res.status(500).json(payload);
            }
          }
        }
      }

      // Update database record
      await db('photos').where({ id }).update({ 
        state, 
        storage_path: newPath,
        updated_at: new Date().toISOString() 
      });

      if (state === 'inprogress') {
        // Run AI pipeline after state change. By default this is enqueued/run async.
        // When caller supplies ?waitForAI=true, we will perform AI processing synchronously
        // and return updated metadata in the response (useful for UI flows that need
        // immediate metadata after moving a photo to inprogress).
        if (waitForAI) {
          try {
            const ai = await updatePhotoAIMetadata(db, row, newPath);
            if (ai) console.log('AI metadata updated for', row.filename);

            // Re-fetch updated row and return metadata to caller
            const updated = await db('photos').where({ id }).first();
            return res.json({ success: true, metadata: { caption: updated.caption, description: updated.description, keywords: updated.keywords } });
          } catch (aiErr) {
            console.error('Synchronous AI processing failed for', row.filename, aiErr && aiErr.message);
            // fall through to async enqueue below
          }
        } else {
          // Fire-and-forget
          updatePhotoAIMetadata(db, row, newPath).then(ai => {
            if (ai) console.log('AI metadata updated for', row.filename);
          }).catch(err => console.error('Async AI processing error:', err && err.message));
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error('State update error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Save captioned image endpoint ---
  router.post('/save-captioned-image', authenticateToken, async (req, res) => {
    const { photoId, dataURL, caption, description, keywords, textStyle } = req.body || {};
    if (!photoId) return res.status(400).json({ success: false, error: 'photoId is required' });
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) return res.status(400).json({ success: false, error: 'Invalid image dataURL' });

    const dataUrlMatch = dataURL.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!dataUrlMatch) return res.status(400).json({ success: false, error: 'Unsupported data URL format' });
    const base64Data = dataUrlMatch[2];
    let imageBuffer;
    try { imageBuffer = Buffer.from(base64Data, 'base64'); } catch { return res.status(400).json({ success: false, error: 'Unable to decode image data' }); }
    if (!imageBuffer || imageBuffer.length === 0) return res.status(400).json({ success: false, error: 'Image data is empty' });

    try {
      const photoRow = await db('photos').where('id', photoId).first();
      if (!photoRow) return res.status(404).json({ success: false, error: 'Photo not found' });

      // Generate unique edited filename
      const originalExt = path.extname(photoRow.filename);
      const baseName = path.basename(photoRow.filename, originalExt);
      let editedFilename = `${baseName}-edit.jpg`;
      let counter = 1;
      
      // Check if edited filename exists in Supabase Storage
      while (true) {
        const { data: existingFiles } = await supabase.storage
          .from('photos')
          .list('inprogress', { search: editedFilename });
        
        if (!existingFiles || existingFiles.length === 0) {
          break;
        }
        
        editedFilename = `${baseName}-edit-${counter}.jpg`;
        counter++;
      }

      // Save the image buffer as JPEG with rotation applied
      const orientedBuffer = await sharp(imageBuffer).rotate().jpeg({ quality: 90 }).toBuffer();
      
      // Upload edited image to Supabase Storage
      const editedPath = `inprogress/${editedFilename}`;
      const { data: _uploadData, error: uploadError } = await supabase.storage
        .from('photos')
        .upload(editedPath, orientedBuffer, {
          contentType: 'image/jpeg',
          duplex: false
        });

      if (uploadError) {
        console.error('Supabase upload error for edited image:', uploadError);
        return res.status(500).json({ success: false, error: 'Failed to upload edited image to storage' });
      }

      // Generate metadata from the edited buffer
      let metadata = {};
      try { 
        metadata = await exifr.parse(orientedBuffer, { 
          tiff: true, ifd0: true, exif: true, gps: true, xmp: true, icc: true, iptc: true 
        }) || {}; 
      } catch (metaErr) { 
        console.warn('Failed to parse metadata for edited image', metaErr && metaErr.message); 
      }

      // Compute hash and update DB
      const crypto = require('crypto');
      const newHash = crypto.createHash('sha256').update(orientedBuffer).digest('hex');
      const now = new Date().toISOString();

      const newCaption = caption !== undefined ? caption : photoRow.caption;
      const newDescription = description !== undefined ? description : photoRow.description;
      const newKeywords = keywords !== undefined ? keywords : photoRow.keywords;
      const newTextStyleJson = textStyle === undefined ? photoRow.text_style : textStyle === null ? null : JSON.stringify(textStyle);

      await db('photos').where('id', photoId).update({
        edited_filename: editedFilename,
        caption: newCaption,
        description: newDescription,
        keywords: newKeywords,
        text_style: newTextStyleJson,
        metadata: JSON.stringify(metadata || {}),
        hash: newHash,
        file_size: orientedBuffer.length,
        storage_path: editedPath,
        updated_at: now
      });

      let parsedTextStyle = null;
      if (newTextStyleJson) {
        try { parsedTextStyle = JSON.parse(newTextStyleJson); } catch { console.warn('Failed to parse text_style after save for photo', photoId); }
      }

      res.json({
        success: true,
        id: photoId,
        filename: photoRow.filename,
        editedFilename,
        state: photoRow.state,
        caption: newCaption,
        description: newDescription,
        keywords: newKeywords,
        textStyle: parsedTextStyle,
        hash: newHash,
        fileSize: orientedBuffer.length,
        metadata,
        storagePath: editedPath
      });
    } catch (error) {
      console.error('Failed to save captioned image for photo', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to save captioned image' });
    }
  });

  // --- Run AI processing endpoint ---
  router.post('/:id/run-ai', authenticateToken, async (req, res) => {
    try {
      // Re-fetch the photo to ensure it exists
      const photo = await db('photos').where({ id: req.params.id }).first();
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Check if Redis/queue is available
      const redisAvailable = await checkRedisAvailable();
      if (!redisAvailable) {
        // Fallback to synchronous processing when Redis is not available
        console.log(`[API] Redis unavailable - processing AI synchronously for photoId: ${photo.id}`);
        
        // Use the storage path for AI processing
        const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;
        
        // Process AI synchronously (this will need to be updated to work with Supabase storage)
        await updatePhotoAIMetadata(db, photo, storagePath);
        
        return res.status(200).json({
          message: 'AI processing completed synchronously.',
          photoId: photo.id,
        });
      }

      // Add a job to the queue when Redis is available
      await addAIJob(photo.id);

      console.log(`[API] Enqueued AI processing for photoId: ${photo.id}`);

      // Respond to the user IMMEDIATELY
      // 202 Accepted means "Your request is accepted and will be processed"
      return res.status(202).json({
        message: 'AI processing has been queued.',
        photoId: photo.id,
      });

    } catch (error) {
      console.error('Error processing AI job:', error);
      return res.status(500).json({ error: 'Failed to process AI job' });
    }
  });

  // --- Display endpoint: Serve images from Supabase Storage ---
  // Use the specialized image authentication middleware which enforces
  // CORS headers and explicitly rejects token-in-query parameters.
  router.get('/display/:state/:filename', authenticateImageRequest, async (req, res) => {
    try {
      const { state, filename } = req.params;
      
      // Handle thumbnail requests (state = "thumbnails")
      if (state === 'thumbnails') {
        const storagePath = `thumbnails/${filename}`;
        
        // Download thumbnail directly from Supabase Storage
        const { data, error } = await supabase.storage
          .from('photos')
          .download(storagePath);

        if (error) {
          console.error('❌ Thumbnail download error:', error);
          return res.status(404).json({ error: 'Thumbnail not found in storage' });
        }

        // Convert data to buffer and serve as JPEG
        const buffer = await data.arrayBuffer();
        const fileBuffer = Buffer.from(buffer);
        
        res.set('Content-Type', 'image/jpeg');
        res.send(fileBuffer);
        return;
      }
      
      // Handle regular photo requests
      // Find the photo in database to get the correct storage path
      const photo = await db('photos')
        .where({ filename, state })
        .orWhere({ edited_filename: filename, state })
        .first();

      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      // Use storage_path if available, otherwise construct from state/filename
      const storagePath = photo.storage_path || `${state}/${filename}`;
      
      // Download the file from Supabase Storage
      const { data, error } = await supabase.storage
        .from('photos')
        .download(storagePath);

      if (error) {
        console.error('Supabase download error:', error);
        return res.status(404).json({ error: 'File not found in storage' });
      }

      // Convert data to buffer
      const buffer = await data.arrayBuffer();
      const fileBuffer = Buffer.from(buffer);

      // Set appropriate content type
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'image/jpeg'; // default
      
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.heic' || ext === '.heif') contentType = 'image/heic';

      // Convert HEIC to JPEG if needed
      if (ext === '.heic' || ext === '.heif') {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer);
          res.set('Content-Type', 'image/jpeg');
          res.send(jpegBuffer);
        } catch (conversionError) {
          console.error('HEIC conversion error:', conversionError);
          res.status(500).json({ error: 'Failed to convert HEIC image' });
        }
      } else {
        res.set('Content-Type', contentType);
        res.send(fileBuffer);
      }

    } catch (err) {
      console.error('Display endpoint error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
};