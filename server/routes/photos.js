const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateThumbnail, convertHeicToJpegBuffer } = require('../media/image');
const { updatePhotoAIMetadata } = require('../ai/service');
const sharp = require('sharp');
const exifr = require('exifr');
const { copyExifMetadata } = require('../media/exif');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const crypto = require('crypto');

module.exports = function createPhotosRouter({ db }, paths) {
  const { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR, THUMB_DIR } = paths;
  const router = express.Router();

  const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });

  const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });

  const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });

  // --- API: List all photos and metadata (include hash) ---
  router.get('/photos', async (req, res) => {
    try {
      const state = req.query.state;
      let sql = 'SELECT id, filename, state, metadata, hash, file_size, caption, description, keywords, text_style, edited_filename FROM photos';
      const params = [];
      if (state === 'working' || state === 'inprogress' || state === 'finished') {
        sql += ' WHERE state = ?';
        params.push(state);
      }
      
      const rows = await dbAll(sql, params);

      // Helper function to get directory based on state
      const getDir = (state) => {
        switch(state) {
          case 'working': return WORKING_DIR;
          case 'inprogress': return INPROGRESS_DIR;
          case 'finished': return FINISHED_DIR;
          default: return WORKING_DIR;
        }
      };

      // Collect IDs of missing files and filter results
      const filteredRows = [];
      const missingIds = [];
      
      for (const row of rows) {
        const dir = getDir(row.state);
        const filePath = path.join(dir, row.filename);
        if (fs.existsSync(filePath)) {
          filteredRows.push(row);
        } else {
          // Collect ID of missing file for batch deletion
          missingIds.push(row.id);
        }
      }

      // Perform batch delete for all missing photos
      if (missingIds.length > 0) {
        const placeholders = missingIds.map(() => '?').join(', ');
        const deleteSql = `DELETE FROM photos WHERE id IN (${placeholders})`;
        const result = await dbRun(deleteSql, missingIds);
        console.log(`Deleted ${missingIds.length} missing photos from DB`);
      }

      // Prevent caching so frontend always gets fresh filtered results
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, photos: filteredRows.map(row => {
        let textStyle = null;
        if (row.text_style) {
          try {
            textStyle = JSON.parse(row.text_style);
          } catch (parseErr) {
            console.warn('Failed to parse text_style for photo', row.id, parseErr.message);
          }
        }
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
          url: `/${row.state}/${row.edited_filename || row.filename}`,
          thumbnail: row.hash ? `/thumbnails/${row.hash}.jpg` : null
        };
      }) });
    } catch (err) {
      console.error('Error in /photos endpoint:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Serve thumbnails (generate on demand if missing) ---
  router.get('/thumbnails/:name', async (req, res) => {
    try {
      const name = req.params.name;
      const thumbPath = path.join(THUMB_DIR, name);
      if (fs.existsSync(thumbPath)) return res.sendFile(thumbPath);
      // Try to derive hash from name (expecting <hash>.jpg)
      const hash = path.basename(name, path.extname(name));
      // Attempt to find original file by matching hash in DB
      db.get('SELECT filename, state FROM photos WHERE hash = ?', [hash], async (err, row) => {
        if (err || !row) return res.status(404).send('Thumbnail not found');
        const getDir = (state) => {
          switch(state) {
            case 'working': return WORKING_DIR;
            case 'inprogress': return INPROGRESS_DIR;
            case 'finished': return FINISHED_DIR;
            default: return WORKING_DIR;
          }
        };
        const origPath = path.join(getDir(row.state), row.filename);
        if (!fs.existsSync(origPath)) return res.status(404).send('Original file missing');
        try {
          const gen = await generateThumbnail(origPath, hash, THUMB_DIR);
          if (gen && fs.existsSync(gen)) return res.sendFile(gen);
          return res.status(500).send('Thumbnail generation failed');
        } catch (genErr) {
          console.error('Thumbnail generation on-demand failed for', origPath, genErr);
          return res.status(500).send('Thumbnail generation failed');
        }
      });
    } catch (e) {
      console.error('Thumbnail route error', e);
      res.status(500).send('Server error');
    }
  });

  // --- Convert and serve images for display (HEIC -> JPEG) ---
  router.get('/display/:state/:filename', async (req, res) => {
    const { state, filename } = req.params;

    // Get directory based on state
    const getDir = (state) => {
      switch(state) {
        case 'working': return WORKING_DIR;
        case 'inprogress': return INPROGRESS_DIR;
        case 'finished': return FINISHED_DIR;
        default: return WORKING_DIR;
      }
    };

    const dir = getDir(state);
    try {
      const row = await dbGet('SELECT filename, edited_filename FROM photos WHERE edited_filename = ? OR filename = ?', [filename, filename]);
      if (!row) {
        return res.status(404).send('File not found');
      }
      const actualFilename = row.edited_filename || row.filename;
      const filePath = path.join(dir, actualFilename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
      }

      const ext = path.extname(actualFilename).toLowerCase();

      // If it's already JPG/PNG/etc, serve directly
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        return res.sendFile(filePath);
      }

      // Convert HEIC/HEIF to JPEG for browser display
      if (['.heic', '.heif'].includes(ext)) {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(filePath, 90);
          res.set('Content-Type', 'image/jpeg');
          return res.send(jpegBuffer);
        } catch (err) {
          console.error('[DISPLAY] Conversion failed for', filePath, err);
          return res.status(500).send('Unable to convert image for display');
        }
      } else {
        // Unsupported format
        return res.status(415).send('Unsupported image format');
      }
    } catch (error) {
      console.error('Display error:', error);
      res.status(500).send('Server error');
    }
  });

  // --- Metadata update endpoint ---
  router.patch('/photos/:id/metadata', async (req, res) => {
    const { id } = req.params;
    try {
      const row = await dbGet('SELECT caption, description, keywords, text_style FROM photos WHERE id = ?', [id]);
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

      await dbRun(
        'UPDATE photos SET caption = ?, description = ?, keywords = ?, text_style = ?, updated_at = ? WHERE id = ?',
        [newCaption, newDescription, newKeywords, newTextStyleJson, new Date().toISOString(), id]
      );

      let parsedTextStyle = null;
      if (newTextStyleJson) {
        try {
          parsedTextStyle = JSON.parse(newTextStyleJson);
        } catch (parseErr) {
          console.warn('Failed to parse text_style after update for photo', id, parseErr.message);
        }
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
  router.patch('/photos/:id/revert', express.json(), async (req, res) => {
    try {
      const { id } = req.params;
      const row = await dbGet('SELECT * FROM photos WHERE id = ?', [id]);
      if (!row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }
      if (!row.edited_filename) {
        return res.status(400).json({ success: false, error: 'No edited version to revert' });
      }
      const editedPath = path.join(INPROGRESS_DIR, row.edited_filename);
      if (fs.existsSync(editedPath)) {
        fs.unlinkSync(editedPath);
      }
      await dbRun('UPDATE photos SET edited_filename = NULL WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to revert photo', id, error);
      res.status(500).json({ success: false, error: error.message || 'Failed to revert' });
    }
  });

  // --- State transition endpoint ---
  router.patch('/photos/:id/state', express.json(), (req, res) => {
    const { id } = req.params;
    const { state } = req.body;
    if (!['working', 'inprogress', 'finished'].includes(state)) {
      return res.status(400).json({ success: false, error: 'Invalid state' });
    }
    db.get('SELECT * FROM photos WHERE id = ?', [id], (err, row) => {
      if (err || !row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      // Helper function to get directory based on state
      const getDir = (state) => {
        switch(state) {
          case 'working': return WORKING_DIR;
          case 'inprogress': return INPROGRESS_DIR;
          case 'finished': return FINISHED_DIR;
          default: return WORKING_DIR;
        }
      };

      const srcDir = getDir(row.state);
      const destDir = getDir(state);
      const srcPath = path.join(srcDir, row.filename);
      const destPath = path.join(destDir, row.filename);
      if (!fs.existsSync(srcPath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      // Move or copy file
      try {
        if (srcPath !== destPath) {
          fs.copyFileSync(srcPath, destPath);
          fs.unlinkSync(srcPath);
        }
        // Set permissions: read-only for working, read/write for inprogress
        if (state === 'working') {
          fs.chmodSync(destPath, 0o444); // read-only
        } else {
          fs.chmodSync(destPath, 0o666); // read/write
        }
        db.run('UPDATE photos SET state = ?, updated_at = ? WHERE id = ?', [state, new Date().toISOString(), id]);
        if (state === 'inprogress') {
          // Run AI pipeline after state change
          updatePhotoAIMetadata(db, row, destPath).then(ai => {
            if (ai) console.log('AI metadata updated for', row.filename);
          });
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
  });

  // --- Save captioned image endpoint ---
  router.post('/save-captioned-image', async (req, res) => {
    const { photoId, dataURL, caption, description, keywords, textStyle } = req.body || {};
    if (!photoId) return res.status(400).json({ success: false, error: 'photoId is required' });
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) return res.status(400).json({ success: false, error: 'Invalid image dataURL' });

    const dataUrlMatch = dataURL.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!dataUrlMatch) return res.status(400).json({ success: false, error: 'Unsupported data URL format' });
    const base64Data = dataUrlMatch[2];
    let imageBuffer;
    try { imageBuffer = Buffer.from(base64Data, 'base64'); } catch (e) { return res.status(400).json({ success: false, error: 'Unable to decode image data' }); }
    if (!imageBuffer || imageBuffer.length === 0) return res.status(400).json({ success: false, error: 'Image data is empty' });

    try {
      const photoRow = await dbGet('SELECT * FROM photos WHERE id = ?', [photoId]);
      if (!photoRow) return res.status(404).json({ success: false, error: 'Photo not found' });

      const resolveDir = (state) => {
        switch (state) { case 'working': return WORKING_DIR; case 'finished': return FINISHED_DIR; default: return INPROGRESS_DIR; }
      };

      const possibleSourcePaths = [
        path.join(resolveDir(photoRow.state), photoRow.filename),
        path.join(WORKING_DIR, photoRow.filename),
        path.join(INPROGRESS_DIR, photoRow.filename),
        path.join(FINISHED_DIR, photoRow.filename),
      ];
      const sourcePath = possibleSourcePaths.find(p => fs.existsSync(p));
      if (!sourcePath) return res.status(404).json({ success: false, error: 'Source file not found on disk' });

      const originalExt = path.extname(photoRow.filename);
      const baseName = path.basename(photoRow.filename, originalExt);
      let editedFilename = `${baseName}-edit.jpg`;
      let counter = 1;
      while (fs.existsSync(path.join(INPROGRESS_DIR, editedFilename))) {
        editedFilename = `${baseName}-edit-${counter}.jpg`;
        counter++;
      }
      const destPath = path.join(INPROGRESS_DIR, editedFilename);

      // Save the image buffer as JPEG with rotation applied
      const orientedBuffer = await sharp(imageBuffer).rotate().jpeg({ quality: 90 }).toBuffer();
      await fs.promises.writeFile(destPath, orientedBuffer);
      try { fs.chmodSync(destPath, 0o666); } catch (permErr) { console.warn('Failed to adjust permissions for', destPath, permErr.message); }

      // Copy EXIF from source and remove orientation tag
      try { await copyExifMetadata(sourcePath, destPath); } catch (e) { console.warn('Failed to copy EXIF:', e && e.message); }
      try {
        const exiftoolBin = path.join(__dirname, '..', 'node_modules', 'exiftool-vendored.exe', 'bin', 'exiftool.exe');
        await execPromise(`"${exiftoolBin}" -Orientation= -overwrite_original "${destPath}"`, { windowsHide: true, timeout: 10000 });
      } catch (e) { console.warn('Failed to remove EXIF orientation:', e && e.message); }

      let metadata = {};
      try { metadata = await exifr.parse(destPath, { tiff: true, ifd0: true, exif: true, gps: true, xmp: true, icc: true, iptc: true }) || {}; } catch (metaErr) { console.warn('Failed to parse metadata for', destPath, metaErr && metaErr.message); }

      // Compute hash and update DB
      const newHash = crypto.createHash('sha256').update(fs.readFileSync(destPath)).digest('hex');
      const stats = await fs.promises.stat(destPath);
      const now = new Date().toISOString();

      const newCaption = caption !== undefined ? caption : photoRow.caption;
      const newDescription = description !== undefined ? description : photoRow.description;
      const newKeywords = keywords !== undefined ? keywords : photoRow.keywords;
      const newTextStyleJson = textStyle === undefined ? photoRow.text_style : textStyle === null ? null : JSON.stringify(textStyle);

      await dbRun(
        'UPDATE photos SET edited_filename = ?, caption = ?, description = ?, keywords = ?, text_style = ?, metadata = ?, hash = ?, file_size = ?, updated_at = ? WHERE id = ?',
        [editedFilename, newCaption, newDescription, newKeywords, newTextStyleJson, JSON.stringify(metadata || {}), newHash, stats.size, now, photoId]
      );

      let parsedTextStyle = null;
      if (newTextStyleJson) {
        try { parsedTextStyle = JSON.parse(newTextStyleJson); } catch (e) { console.warn('Failed to parse text_style after save for photo', photoId); }
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
        fileSize: stats.size,
        metadata,
      });
    } catch (error) {
      console.error('Failed to save captioned image for photo', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to save captioned image' });
    }
  });

  return router;
};