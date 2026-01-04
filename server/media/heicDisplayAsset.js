const path = require('path');
const { convertHeicToJpegBuffer } = require('./image');
const logger = require('../logger');

function getOriginalExtension(storagePath, filename) {
  const fromPath = storagePath ? path.posix.extname(String(storagePath)).toLowerCase() : '';
  const fromName = filename ? path.posix.extname(String(filename)).toLowerCase() : '';
  return fromPath || fromName || '';
}

function isHeicFormat(ext) {
  return ext === '.heic' || ext === '.heif';
}

function buildDisplayPath({ userId, photoId }) {
  return `display/${String(userId)}/${String(photoId)}.jpg`;
}

async function downloadBlobToBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate a private JPEG "display asset" for HEIC/HEIF photos.
 *
 * Idempotent behavior:
 * - If the photo is not HEIC/HEIF, returns { skipped: true }.
 * - If photo.display_path already exists, returns { skipped: true }.
 * - If upload fails, does NOT set display_path (caller can fall back to request-time conversion).
 */
async function ensureHeicDisplayAsset({ db, storageClient, photo }) {
  if (!db || typeof db !== 'function') throw new Error('db is required');
  if (!storageClient || typeof storageClient.download !== 'function' || typeof storageClient.upload !== 'function') {
    throw new Error('storageClient with download/upload is required');
  }
  if (!photo || photo.id == null) throw new Error('photo is required');

  const photoId = photo.id;
  const userId = photo.user_id;
  const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;

  const ext = getOriginalExtension(storagePath, photo.filename);
  if (!isHeicFormat(ext)) return { skipped: true, reason: 'not_heic' };

  if (photo.display_path) return { skipped: true, reason: 'already_has_display_path' };

  const displayPath = buildDisplayPath({ userId, photoId });

  const { data, error } = await storageClient.download(storagePath);
  if (error || !data) {
    throw new Error(error?.message || 'Failed to download original from storage');
  }

  const originalBuffer = await downloadBlobToBuffer(data);
  const jpegBuffer = await convertHeicToJpegBuffer(originalBuffer, 95);

  const upload = await storageClient.upload(displayPath, jpegBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (upload?.error) {
    logger.warn('[DISPLAY ASSET] Upload failed; leaving display_path NULL', {
      photoId: String(photoId),
      displayPath,
      error: upload.error?.message || String(upload.error),
    });
    return { ok: false, reason: 'upload_failed' };
  }

  await db('photos')
    .where({ id: photoId })
    .update({
      display_path: displayPath,
      display_mime: 'image/jpeg',
      derivatives_status: 'ready',
      derivatives_error: null,
      updated_at: new Date().toISOString(),
    });

  return { ok: true, displayPath };
}

module.exports = {
  ensureHeicDisplayAsset,
  __private__: {
    getOriginalExtension,
    isHeicFormat,
    buildDisplayPath,
  },
};
