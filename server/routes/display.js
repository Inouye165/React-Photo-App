const express = require('express');
const path = require('path');
const { convertHeicToJpegBuffer } = require('../media/image');
const supabase = require('../lib/supabaseClient');

// Lightweight storage error formatter (non-sensitive)
function formatStorageError(err) {
  if (!err) return { message: 'Unknown error' };
  const message = err.message || err.msg || err.error_description || err.error || (typeof err === 'string' ? err : String(err));
  const status = err.status || err.statusCode || null;
  return { message, status };
}

module.exports = function createDisplayRouter(/* { db } not currently used */) {
  const router = express.Router();

  // Public display endpoint. Must remain unauthenticated so <img> tags
  // can fetch images directly from the browser.
  router.get('/display/:state/:filename', async (req, res) => {
    try {
      const rawState = req.params.state || '';
      const rawFilename = req.params.filename || '';
      const state = decodeURIComponent(rawState);
      const filename = decodeURIComponent(rawFilename);
      const storagePath = `${state}/${filename}`;

      const ext = path.extname(filename).toLowerCase();
      const isHeic = ext === '.heic' || ext === '.heif';

      // Honor inline proxy mode: when `?inline=1` is present, stream the
      // image bytes from storage through this server and set CORS so canvas
      // consumers can safely load and draw the image.
      const inline = req.query && (req.query.inline === '1' || req.query.inline === 'true');

      // Non-HEIC: redirect to short-lived signed URL (or inline-stream when requested)
      if (!isHeic) {
        const EXPIRATION = 60;
        const { data, error } = await supabase.storage.from('photos').createSignedUrl(storagePath, EXPIRATION);
        if (error || !data || !data.signedUrl) {
          const formatted = formatStorageError(error || 'Failed to create signed URL');
          console.error('Display(public): failed to create signed url for', storagePath, formatted);
          return res.status(500).json({ success: false, error: formatted.message || 'Failed to generate signed URL' });
        }
        if (inline) {
          // Stream the object bytes through the server so we can set CORS headers
          try {
            const { data: dl, error: dlErr } = await supabase.storage.from('photos').download(storagePath);
            if (dlErr || !dl) {
              const formatted = formatStorageError(dlErr);
              console.error('Display(public:inline): download failed for', storagePath, formatted);
              return res.status(404).json({ success: false, error: formatted.message || 'File not found' });
            }
            const buf = Buffer.from(await dl.arrayBuffer());
            res.set('Content-Type', dl.type || 'application/octet-stream');
            res.set('Cache-Control', 'public, max-age=60');
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            return res.send(buf);
          } catch (e) {
            console.error('Display(public:inline): exception while proxying', storagePath, e && e.message ? e.message : e);
            return res.status(500).json({ success: false, error: 'Failed to proxy image' });
          }
        }
        return res.redirect(307, data.signedUrl);
      }

      // For HEIC: check cached converted JPEG first
      const convertedPath = `converted/${state}/${filename.replace(/\.[^.]+$/, '')}.jpg`;
      try {
        const { data: convData, error: convErr } = await supabase.storage.from('photos').createSignedUrl(convertedPath, 60);
        if (!convErr && convData && convData.signedUrl) {
          if (inline) {
            // Stream converted bytes through server with CORS
            try {
              const { data: dl, error: dlErr } = await supabase.storage.from('photos').download(convertedPath);
              if (!dlErr && dl) {
                const buf = Buffer.from(await dl.arrayBuffer());
                res.set('Content-Type', 'image/jpeg');
                res.set('Cache-Control', 'public, max-age=60');
                res.set('Access-Control-Allow-Origin', '*');
                res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                return res.send(buf);
              }
            } catch (e) {
              console.error('Display(public:inline): failed proxying converted image', convertedPath, e && e.message ? e.message : e);
              // fallthrough to redirect as a best-effort fallback
            }
          }
          return res.redirect(307, convData.signedUrl);
        }
      } catch {
        // ignore and continue to conversion
      }

      // Download original HEIC
      const { data: downloadData, error: downloadError } = await supabase.storage.from('photos').download(storagePath);
      if (downloadError || !downloadData) {
        const formatted = formatStorageError(downloadError);
        console.error('Display(public): download failed for', storagePath, formatted);
        return res.status(404).json({ success: false, error: formatted.message || 'File not found' });
      }

      const arrayBuffer = await downloadData.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      let jpegBuffer;
      try {
        if (typeof convertHeicToJpegBuffer === 'function') {
          jpegBuffer = await convertHeicToJpegBuffer(inputBuffer);
        } else {
          const sharp = require('sharp');
          jpegBuffer = await sharp(inputBuffer).rotate().jpeg({ quality: 90 }).toBuffer();
        }
      } catch (convErr) {
        console.error('Display(public): HEIC conversion failed for', storagePath, convErr && convErr.message ? convErr.message : convErr);
        return res.status(500).json({ success: false, error: 'Failed to convert HEIC to JPEG' });
      }

      // Upload converted JPEG to a cache location (upsert true to tolerate races)
      try {
        const { error: uploadErr } = await supabase.storage.from('photos').upload(convertedPath, jpegBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
          duplex: false
        });
        if (uploadErr) {
          const formatted = formatStorageError(uploadErr);
          console.error('Display(public): failed to upload converted image for', convertedPath, formatted);
          res.set('Content-Type', 'image/jpeg');
          res.set('Cache-Control', 'public, max-age=60');
          res.set('Access-Control-Allow-Origin', '*');
          res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          return res.send(jpegBuffer);
        }
      } catch (uErr) {
        console.error('Display(public): upload exception for', convertedPath, uErr && uErr.message ? uErr.message : uErr);
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=60');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        return res.send(jpegBuffer);
      }

      // On success, return a signed URL to the converted JPEG
      try {
        const { data: finalData, error: finalErr } = await supabase.storage.from('photos').createSignedUrl(convertedPath, 60);
        if (finalErr || !finalData || !finalData.signedUrl) {
          const formatted = formatStorageError(finalErr || 'Failed to create signed URL for converted');
          console.error('Display(public): failed to create signed url for converted', convertedPath, formatted);
          res.set('Content-Type', 'image/jpeg');
          res.set('Cache-Control', 'public, max-age=60');
          res.set('Access-Control-Allow-Origin', '*');
          res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          return res.send(jpegBuffer);
        }
        if (inline) {
          // Stream converted bytes (we already have jpegBuffer) and return with CORS
          res.set('Content-Type', 'image/jpeg');
          res.set('Cache-Control', 'public, max-age=60');
          res.set('Access-Control-Allow-Origin', '*');
          res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          return res.send(jpegBuffer);
        }
        return res.redirect(307, finalData.signedUrl);
      } catch (e) {
        console.error('Display(public): exception creating final signed url', e && e.message ? e.message : e);
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=60');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        return res.send(jpegBuffer);
      }
    } catch (err) {
      console.error('Display(public) endpoint error:', err && err.message ? err.message : err);
      return res.status(500).json({ success: false, error: err && err.message ? err.message : 'Internal error' });
    }
  });

  return router;
};
