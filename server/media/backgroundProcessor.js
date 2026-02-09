/**
 * Background photo processor for streaming upload architecture.
 * 
 * This module handles heavy processing tasks that are deferred from
 * the upload endpoint:
 * 1. EXIF metadata extraction from Supabase Storage
 * 2. Thumbnail generation and upload to Supabase Storage
 * 3. File hash verification (if not done during upload)
 * 
 * The processor downloads files from Supabase Storage, processes them
 * in memory, and uploads results back to storage. No local disk I/O.
 */

const sharp = require('sharp');
const exifr = require('exifr');
const crypto = require('crypto');
const path = require('path');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');
const { convertHeicToJpegBuffer } = require('./image');
const createPhotosImage = require('../services/photosImage');

const photosImage = createPhotosImage({ sharp, exifr, crypto });

// Configure sharp for constrained resource usage
sharp.concurrency(1);
sharp.cache({ memory: 50, files: 10, items: 100 });

const THUMBNAIL_WEBP_QUALITY = 80;
const SMALL_THUMBNAIL_WEBP_QUALITY = 75;

function sanitizeFilenameForLog(filename) {
  const raw = typeof filename === 'string' ? filename : '';
  const base = path.posix.basename(raw.replace(/\\/g, '/'));
  const trimmed = base.trim().slice(0, 180) || 'unknown';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function classifyImageProcessingError(err) {
  const message = err && typeof err.message === 'string' ? err.message : '';
  const lowered = message.toLowerCase();

  if (
    lowered.includes('no decoding plugin installed') ||
    lowered.includes('no decoding plugin') ||
    lowered.includes('heif:') ||
    lowered.includes('libheif') ||
    lowered.includes('heif plugin')
  ) {
    return { code: 'heif_decoder_missing' };
  }

  if (
    lowered.includes('unsupported image format') ||
    lowered.includes('input buffer contains unsupported image format') ||
    lowered.includes('corrupt') ||
    lowered.includes('invalid')
  ) {
    return { code: 'corrupt_or_unsupported_image' };
  }

  if (lowered.includes('timeout') || lowered.includes('timed out') || lowered.includes('etimedout')) {
    return { code: 'image_processing_timeout' };
  }

  return { code: 'image_processing_failed' };
}

function safeParseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isNonEmptyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function hasValidGps(meta) {
  const latCandidates = [meta?.latitude, meta?.GPSLatitude, meta?.gps?.lat, meta?.GPS?.latitude];
  const lonCandidates = [meta?.longitude, meta?.GPSLongitude, meta?.gps?.lon, meta?.GPS?.longitude];
  const lat = Number(latCandidates.find((v) => v != null));
  const lon = Number(lonCandidates.find((v) => v != null));
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function hasValidDate(meta) {
  const candidates = [
    meta?.DateTimeOriginal,
    meta?.CreateDate,
    meta?.DateCreated,
    meta?.DateTimeDigitized,
    meta?.ModifyDate,
    meta?.DateTime,
  ].filter(Boolean);
  if (candidates.length === 0) return false;
  const value = candidates[0];
  const date = value instanceof Date ? value : new Date(String(value).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
  return !Number.isNaN(date.getTime());
}

function preserveFields(target, source, keys) {
  for (const key of keys) {
    if (source && source[key] != null && target[key] == null) {
      target[key] = source[key];
    }
  }
}

function mergeMetadataPreservingLocationAndDate(existingMeta, extractedMeta) {
  const existing = existingMeta && typeof existingMeta === 'object' ? existingMeta : {};
  const extracted = extractedMeta && typeof extractedMeta === 'object' ? extractedMeta : {};

  // If extraction failed or produced nothing, do not change metadata at all.
  if (!isNonEmptyObject(extracted)) return existing;

  const merged = { ...existing, ...extracted };

  // Clear "pending" marker once we have real metadata.
  if (merged.pending) {
    delete merged.pending;
  }

  // If extracted metadata doesn't include valid GPS, preserve existing GPS-related fields.
  if (!hasValidGps(extracted) && hasValidGps(existing)) {
    preserveFields(merged, existing, [
      'latitude',
      'longitude',
      'GPSLatitude',
      'GPSLongitude',
      'GPSLatitudeRef',
      'GPSLongitudeRef',
      'GPSAltitude',
      'GPSImgDirection',
      'GPSDestBearing',
      'gps',
      'GPS',
    ]);
  }

  // If extracted metadata doesn't include a valid capture date, preserve existing date fields.
  if (!hasValidDate(extracted) && hasValidDate(existing)) {
    preserveFields(merged, existing, [
      'DateTimeOriginal',
      'CreateDate',
      'DateCreated',
      'DateTimeDigitized',
      'ModifyDate',
      'DateTime',
    ]);
  }

  return merged;
}

/**
 * Downloads a file from Supabase Storage and returns it as a Buffer.
 * Uses streaming to avoid loading the entire file into memory at once
 * where possible.
 * 
 * @param {string} storagePath - Path in the 'photos' bucket
 * @returns {Promise<Buffer>} File contents as Buffer
 */
async function downloadFromStorage(storagePath) {
  const { data, error } = await supabase.storage
    .from('photos')
    .download(storagePath);

  if (error) {
    throw new Error(`Failed to download from storage: ${error.message}`);
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Converts DMS (Degrees, Minutes, Seconds) array to decimal degrees.
 * If input is already a number, returns it as-is.
 * 
 * @param {number|Array} value - DMS array [degrees, minutes, seconds] or decimal number
 * @returns {number|null} Decimal degrees or null
 */
function dmsToDecimal(value) {
  if (value == null) return null;
  
  // Already a decimal number
  if (typeof value === 'number') {
    return value;
  }
  
  // DMS array format [degrees, minutes, seconds]
  if (Array.isArray(value) && value.length >= 2) {
    const [degrees, minutes, seconds = 0] = value;
    return degrees + minutes / 60 + seconds / 3600;
  }
  
  return null;
}

/**
 * Extracts EXIF metadata from an image buffer.
 * Handles HEIC conversion if needed.
 * 
 * @param {Buffer} buffer - Image data
 * @param {string} filename - Original filename (for format detection)
 * @returns {Promise<Object>} Extracted metadata
 */
async function extractMetadata(buffer, filename) {
  try {
    // Extract EXIF directly from original buffer - don't convert HEIC to JPEG
    // as conversion can lose metadata and may fail on certain HEIC compression formats
    const metadata = await exifr.parse(buffer, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      iptc: true,
      translateKeys: true,
      translateValues: true
    });

    if (!metadata) return {};

    // Convert GPS coordinates from DMS to decimal if needed
    let lat = dmsToDecimal(metadata.GPSLatitude || metadata.latitude);
    let lon = dmsToDecimal(metadata.GPSLongitude || metadata.longitude);
    
    // Apply hemisphere signs (S and W are negative)
    if (lat != null && metadata.GPSLatitudeRef === 'S') {
      lat = -Math.abs(lat);
    }
    if (lon != null && metadata.GPSLongitudeRef === 'W') {
      lon = -Math.abs(lon);
    }

    // Normalize GPS fields for frontend compatibility
    // Add top-level latitude/longitude (frontend check #1)
    if (lat != null && lon != null) {
      metadata.latitude = lat;
      metadata.longitude = lon;
      metadata.GPSLatitude = lat;
      metadata.GPSLongitude = lon;
    }

    // Add nested gps object with shortened names (frontend check #4)
    if (lat != null && lon != null) {
      metadata.gps = {
        lat,
        lon,
        alt: metadata.GPSAltitude || null,
        direction: metadata.GPSImgDirection || metadata.GPSDestBearing || null
      };
    }

    // Add nested GPS object with full names (frontend check #3)
    if (lat != null && lon != null) {
      metadata.GPS = {
        latitude: lat,
        longitude: lon,
        altitude: metadata.GPSAltitude || null,
        imgDirection: metadata.GPSImgDirection || metadata.GPSDestBearing || null
      };
    }

    return metadata;
  } catch (err) {
    logger.warn('[Processor] exif_extract_failed', {
      filename: sanitizeFilenameForLog(filename),
      error: err,
    });
    return {};
  }
}

/**
 * Calculates SHA256 hash of a buffer.
 * 
 * @param {Buffer} buffer - Data to hash
 * @returns {string} Hex-encoded hash
 */
function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getOriginalExtensionFromFilename(filename) {
  const ext = filename ? String(filename).toLowerCase().split('.').pop() : '';
  return ext ? `.${ext}` : '';
}

function buildDisplayWebpPath({ userId, photoId }) {
  return `display/${String(userId)}/${String(photoId)}.webp`;
}

async function generateAndUploadDisplayWebp({ buffer, photo, storagePath }) {
  if (!photo || photo.id == null || !photo.user_id) {
    throw new Error('photo with id and user_id is required');
  }

  if (photo.display_path) {
    return { skipped: true, reason: 'already_has_display_path' };
  }

  const filenameExt = getOriginalExtensionFromFilename(photo.filename);
  const originalIsHeic = filenameExt === '.heic' || filenameExt === '.heif';
  const displayPath = buildDisplayWebpPath({ userId: photo.user_id, photoId: photo.id });

  try {
    // CRITICAL: Preserve embedded metadata on the generated WebP.
    // EXIF extraction for DB is handled separately (and earlier) from the original bytes.
    const webpBuffer = await photosImage.convertToWebpWithMetadata(buffer, { quality: 80 });

    const { error } = await supabase.storage
      .from('photos')
      .upload(displayPath, webpBuffer, {
        contentType: 'image/webp',
        upsert: true,
        cacheControl: '31536000',
      });

    if (error) {
      logger.warn('[Processor] WebP upload failed; will fall back', {
        photoId: String(photo.id),
        displayPath,
        storagePath,
        error: error?.message || String(error),
      });
      return { ok: false, reason: 'upload_failed', originalIsHeic };
    }

    return { ok: true, displayPath, originalIsHeic };
  } catch (err) {
    logger.warn('[Processor] WebP conversion failed; will fall back', {
      photoId: String(photo.id),
      displayPath,
      storagePath,
      error: err?.message || String(err),
    });
    return { ok: false, reason: 'convert_failed', originalIsHeic };
  }
}

/**
 * Generates a thumbnail and uploads it to Supabase Storage.
 * 
 * @param {Buffer} buffer - Original image data
 * @param {string} filename - Original filename
 * @param {string} hash - File hash (used as thumbnail filename)
 * @returns {Promise<string|null>} Thumbnail path or null on failure
 */
async function generateAndUploadThumbnail(buffer, filename, hash, ctx = null) {
  const thumbnailPath = `thumbnails/${hash}.webp`;

  try {
    // Check if thumbnail already exists
    const { data: existingList } = await supabase.storage
      .from('photos')
      .list('thumbnails', { search: `${hash}.webp` });

    if (existingList && existingList.length > 0) {
      return thumbnailPath; // Already exists
    }

    const ext = filename.toLowerCase().split('.').pop();

    // Try to generate thumbnail directly (works for JPEG, PNG, and HEIC if sharp supports it)
    // Use 800x800 for high-DPI (Retina) display support - displays at 400x400 CSS pixels look crisp at 2x
    let thumbnailBuffer;
    try {
      thumbnailBuffer = await sharp(buffer)
        .rotate() // Auto-rotate based on EXIF orientation
        .resize(800, 800, { fit: 'inside' })
        .withMetadata()
        .webp({ quality: THUMBNAIL_WEBP_QUALITY })
        .toBuffer();
    } catch (err) {
      // If direct processing failed and it's HEIC, try the fallback conversion
      if (ext === 'heic' || ext === 'heif') {
        try {
          // Use higher quality for intermediate step to avoid blurriness
          const jpegBuffer = await convertHeicToJpegBuffer(buffer, 90);
          thumbnailBuffer = await sharp(jpegBuffer)
            .rotate() // Auto-rotate based on EXIF orientation
            .resize(800, 800, { fit: 'inside' })
            .withMetadata()
            .webp({ quality: THUMBNAIL_WEBP_QUALITY })
            .toBuffer();
        } catch (fallbackErr) {
          const classification = classifyImageProcessingError(fallbackErr);
          if (ctx && typeof ctx === 'object') {
            ctx.errorCode = classification.code;
            ctx.errorStage = 'heic_fallback_thumbnail';
          }
          logger.error('[Processor] heic_thumbnail_fallback_failed', {
            filename: sanitizeFilenameForLog(filename),
            code: classification.code,
            error: fallbackErr,
          });
          return null;
        }
      } else {
        // Not HEIC or fallback failed
        const classification = classifyImageProcessingError(err);
        if (ctx && typeof ctx === 'object') {
          ctx.errorCode = classification.code;
          ctx.errorStage = 'direct_thumbnail';
        }
        logger.error('[Processor] thumbnail_generation_failed', {
          filename: sanitizeFilenameForLog(filename),
          code: classification.code,
          error: err,
        });
        return null;
      }
    }

    // Upload to storage
    const { error } = await supabase.storage
      .from('photos')
      .upload(thumbnailPath, thumbnailBuffer, {
        contentType: 'image/webp',
        upsert: false,
        cacheControl: '31536000' // 1 year cache for immutable content-addressed files
      });

    if (error) {
      // Might be a race condition - file already exists
      if (error.message?.includes('duplicate') || error.message?.includes('already exists')) {
        return thumbnailPath;
      }
      if (ctx && typeof ctx === 'object') {
        ctx.errorCode = 'thumbnail_upload_failed';
        ctx.errorStage = 'upload_thumbnail';
      }
      logger.error('[Processor] thumbnail_upload_failed', {
        filename: sanitizeFilenameForLog(filename),
        code: 'thumbnail_upload_failed',
        error,
      });
      return null;
    }

    return thumbnailPath;
  } catch (err) {
    const classification = classifyImageProcessingError(err);
    if (ctx && typeof ctx === 'object') {
      ctx.errorCode = classification.code;
      ctx.errorStage = 'thumbnail_outer';
    }
    logger.error('[Processor] thumbnail_generation_failed', {
      filename: sanitizeFilenameForLog(filename),
      code: classification.code,
      error: err,
    });
    return null;
  }
}

/**
 * Generates a grid-optimized small thumbnail and uploads it to Supabase Storage.
 *
 * Target: ~320px max dimension for fast gallery grid rendering.
 *
 * @param {Buffer} buffer - Original image data
 * @param {string} filename - Original filename
 * @param {string} hash - File hash (used as thumbnail filename)
 * @returns {Promise<string|null>} Thumbnail path or null on failure
 */
async function generateAndUploadSmallThumbnail(buffer, filename, hash, ctx = null) {
  const thumbnailPath = `thumbnails/${hash}-sm.webp`;

  try {
    const { data: existingList } = await supabase.storage
      .from('photos')
      .list('thumbnails', { search: `${hash}-sm.webp` });

    if (existingList && existingList.length > 0) {
      return thumbnailPath;
    }

    const ext = filename.toLowerCase().split('.').pop();

    let thumbnailBuffer;
    try {
      thumbnailBuffer = await sharp(buffer)
        .rotate()
        .resize(320, 320, { fit: 'inside' })
        .withMetadata()
        .webp({ quality: SMALL_THUMBNAIL_WEBP_QUALITY })
        .toBuffer();
    } catch (err) {
      if (ext === 'heic' || ext === 'heif') {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(buffer, 90);
          thumbnailBuffer = await sharp(jpegBuffer)
            .rotate()
            .resize(320, 320, { fit: 'inside' })
            .withMetadata()
            .webp({ quality: SMALL_THUMBNAIL_WEBP_QUALITY })
            .toBuffer();
        } catch (fallbackErr) {
          const classification = classifyImageProcessingError(fallbackErr);
          if (ctx && typeof ctx === 'object' && !ctx.errorCode) {
            ctx.errorCode = classification.code;
            ctx.errorStage = 'heic_fallback_small_thumbnail';
          }
          logger.error('[Processor] heic_small_thumbnail_fallback_failed', {
            filename: sanitizeFilenameForLog(filename),
            code: classification.code,
            error: fallbackErr,
          });
          return null;
        }
      } else {
        const classification = classifyImageProcessingError(err);
        if (ctx && typeof ctx === 'object' && !ctx.errorCode) {
          ctx.errorCode = classification.code;
          ctx.errorStage = 'direct_small_thumbnail';
        }
        logger.error('[Processor] small_thumbnail_generation_failed', {
          filename: sanitizeFilenameForLog(filename),
          code: classification.code,
          error: err,
        });
        return null;
      }
    }

    const { error } = await supabase.storage
      .from('photos')
      .upload(thumbnailPath, thumbnailBuffer, {
        contentType: 'image/webp',
        upsert: false,
        cacheControl: '31536000'
      });

    if (error) {
      if (error.message?.includes('duplicate') || error.message?.includes('already exists')) {
        return thumbnailPath;
      }
      if (ctx && typeof ctx === 'object' && !ctx.errorCode) {
        ctx.errorCode = 'small_thumbnail_upload_failed';
        ctx.errorStage = 'upload_small_thumbnail';
      }
      logger.error('[Processor] small_thumbnail_upload_failed', {
        filename: sanitizeFilenameForLog(filename),
        code: 'small_thumbnail_upload_failed',
        error,
      });
      return null;
    }

    return thumbnailPath;
  } catch (err) {
    const classification = classifyImageProcessingError(err);
    if (ctx && typeof ctx === 'object' && !ctx.errorCode) {
      ctx.errorCode = classification.code;
      ctx.errorStage = 'small_thumbnail_outer';
    }
    logger.error('[Processor] small_thumbnail_generation_failed', {
      filename: sanitizeFilenameForLog(filename),
      code: classification.code,
      error: err,
    });
    return null;
  }
}

/**
 * Process a photo that was uploaded via streaming.
 * 
 * This is the main entry point for background processing.
 * It downloads the file from storage, extracts metadata,
 * generates a thumbnail, and updates the database.
 * 
 * @param {Object} db - Knex database instance
 * @param {number} photoId - ID of the photo record
 * @param {Object} options - Processing options
 * @param {boolean} options.processMetadata - Whether to extract EXIF
 * @param {boolean} options.generateThumbnail - Whether to generate thumbnail
 * @returns {Promise<Object>} Processing result
 */
async function processUploadedPhoto(db, photoId, options = {}) {
  const { processMetadata: doMetadata = true, generateThumbnail: doThumbnail = true, generateDisplay: doDisplay = true } = options;

  // Get photo record
  const photo = await db('photos').where({ id: photoId }).first();
  if (!photo) {
    throw new Error(`Photo with ID ${photoId} not found`);
  }

  const storagePath = photo.storage_path;
  if (!storagePath) {
    throw new Error(`Photo ${photoId} has no storage_path`);
  }

  logger.info('[Processor] processing_photo', {
    photoId: String(photoId),
    filename: sanitizeFilenameForLog(photo.filename),
    storagePath,
  });

  // Download the file
  const buffer = await downloadFromStorage(storagePath);
  logger.debug('[Processor] downloaded_original', { photoId: String(photoId), bytes: buffer.length });

  const updates = {
    updated_at: new Date().toISOString()
  };

  // Default: keep pending until we successfully persist derivative info.
  // Upload route seeds this to 'pending' for new photos.
  updates.derivatives_error = null;

  // Extract metadata if requested
  if (doMetadata) {
    const metadata = await extractMetadata(buffer, photo.filename);
    const existingMeta = safeParseJson(photo.metadata, {});
    const mergedMeta = mergeMetadataPreservingLocationAndDate(existingMeta, metadata);

    // Only write metadata if we actually have something meaningful (prevents wiping existing GPS/date).
    if (isNonEmptyObject(mergedMeta)) {
      updates.metadata = JSON.stringify(mergedMeta);
      logger.debug('[Processor] extracted_metadata', {
        photoId: String(photoId),
        fields: Object.keys(metadata || {}).length,
      });
    } else {
      logger.warn('[Processor] metadata_empty_skip_update', { photoId: String(photoId) });
    }
  }

  // Verify/update hash if needed
  if (!photo.hash || photo.hash === 'pending') {
    updates.hash = hashBuffer(buffer);
    logger.debug('[Processor] calculated_hash', { photoId: String(photoId) });
  }

  // Generate thumbnail if requested
  if (doThumbnail) {
    const hash = updates.hash || photo.hash;
    const thumbCtx = { errorCode: null, errorStage: null };
    const thumbnailPath = await generateAndUploadThumbnail(buffer, photo.filename, hash, thumbCtx);
    if (thumbnailPath) {
      updates.thumb_path = thumbnailPath;
      updates.thumb_mime = 'image/webp';
      logger.debug('[Processor] generated_thumbnail', { photoId: String(photoId) });
    } else {
      // Best-effort: flag failure so UI can reflect it and retries can be triggered later.
      updates.derivatives_status = 'failed';
      updates.derivatives_error = thumbCtx.errorCode || 'thumbnail_generation_failed';
    }

    // Best-effort: generate a smaller grid thumbnail. Do not fail the whole job if this fails.
    // UI will fall back to the standard thumbnail when thumb_small_path is missing.
    const smallCtx = { errorCode: null, errorStage: null };
    const smallPath = await generateAndUploadSmallThumbnail(buffer, photo.filename, hash, smallCtx);
    if (smallPath) {
      updates.thumb_small_path = smallPath;
      logger.debug('[Processor] generated_small_thumbnail', { photoId: String(photoId) });
    }
  }

  // Generate WebP display asset if requested.
  // Resilience:
  // - If WebP generation fails for non-HEIC, set display_path to the original storagePath.
  // - If WebP generation fails for HEIC/HEIF, leave display_path NULL so existing
  //   request-time HEIC conversion (or HEIC JPEG display-asset worker) remains safe.
  if (doDisplay) {
    const result = await generateAndUploadDisplayWebp({ buffer, photo, storagePath });
    if (result && result.ok && result.displayPath) {
      updates.display_path = result.displayPath;
      updates.display_mime = 'image/webp';
      logger.debug('[Processor] generated_display_asset', { photoId: String(photoId) });
    } else if (result && !result.ok && !result.originalIsHeic) {
      updates.display_path = storagePath;
      // Display falls back to the original bytes for non-HEIC.
      updates.display_mime = photo.original_mime || null;
      logger.debug('[Processor] display_fallback_to_original', { photoId: String(photoId) });
    }
  }

  // If we have both thumbnail and a display path, the derivatives are ready.
  // HEIC may still be pending here if display_path wasn't set (handled later by HEIC display-asset worker).
  const effectiveDisplayPath = updates.display_path || photo.display_path;
  const effectiveThumbPath = updates.thumb_path || photo.thumb_path;
  if (effectiveDisplayPath && effectiveThumbPath && updates.derivatives_status !== 'failed') {
    updates.derivatives_status = 'ready';
  }

  // Update database
  await db('photos').where({ id: photoId }).update(updates);
  logger.info('[Processor] updated_photo', {
    photoId: String(photoId),
    derivatives_status: updates.derivatives_status || null,
    derivatives_error: updates.derivatives_error || null,
  });

  return {
    photoId,
    filename: photo.filename,
    metadataExtracted: doMetadata,
    thumbnailGenerated: doThumbnail,
    displayGenerated: doDisplay,
    hash: updates.hash || photo.hash
  };
}

module.exports = {
  processUploadedPhoto,
  downloadFromStorage,
  extractMetadata,
  mergeMetadataPreservingLocationAndDate,
  generateAndUploadThumbnail,
  generateAndUploadSmallThumbnail,
  generateAndUploadDisplayWebp,
  hashBuffer
};
