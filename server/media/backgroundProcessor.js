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
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');
const { convertHeicToJpegBuffer } = require('./image');
const createPhotosImage = require('../services/photosImage');

const photosImage = createPhotosImage({ sharp, exifr, crypto });

// Configure sharp for constrained resource usage
sharp.concurrency(1);
sharp.cache({ memory: 50, files: 10, items: 100 });

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
    logger.warn(`Failed to extract EXIF for ${filename}:`, err.message);
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
async function generateAndUploadThumbnail(buffer, filename, hash) {
  const thumbnailPath = `thumbnails/${hash}.jpg`;

  try {
    // Check if thumbnail already exists
    const { data: existingList } = await supabase.storage
      .from('photos')
      .list('thumbnails', { search: `${hash}.jpg` });

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
        .jpeg({ quality: 85 })
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
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch (fallbackErr) {
          logger.warn(`HEIC fallback conversion failed for thumbnail:`, fallbackErr.message);
          return null;
        }
      } else {
        // Not HEIC or fallback failed
        logger.error(`Thumbnail generation failed for ${filename}:`, err.message);
        return null;
      }
    }

    // Upload to storage
    const { error } = await supabase.storage
      .from('photos')
      .upload(thumbnailPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
        cacheControl: '31536000' // 1 year cache for immutable content-addressed files
      });

    if (error) {
      // Might be a race condition - file already exists
      if (error.message?.includes('duplicate') || error.message?.includes('already exists')) {
        return thumbnailPath;
      }
      logger.error(`Failed to upload thumbnail:`, error);
      return null;
    }

    return thumbnailPath;
  } catch (err) {
    logger.error(`Thumbnail generation failed for ${filename}:`, err.message);
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

  logger.info(`[Processor] Processing photo ${photoId} (${photo.filename}) from ${storagePath}`);

  // Download the file
  const buffer = await downloadFromStorage(storagePath);
  logger.debug(`[Processor] Downloaded ${buffer.length} bytes`);

  const updates = {
    updated_at: new Date().toISOString()
  };

  // Extract metadata if requested
  if (doMetadata) {
    const metadata = await extractMetadata(buffer, photo.filename);
    const existingMeta = safeParseJson(photo.metadata, {});
    const mergedMeta = mergeMetadataPreservingLocationAndDate(existingMeta, metadata);

    // Only write metadata if we actually have something meaningful (prevents wiping existing GPS/date).
    if (isNonEmptyObject(mergedMeta)) {
      updates.metadata = JSON.stringify(mergedMeta);
      logger.debug(`[Processor] Extracted metadata with ${Object.keys(metadata || {}).length} fields (merged)`);
    } else {
      logger.warn(`[Processor] Skipping metadata update for photo ${photoId}: extraction returned empty and existing metadata was empty`);
    }
  }

  // Verify/update hash if needed
  if (!photo.hash || photo.hash === 'pending') {
    updates.hash = hashBuffer(buffer);
    logger.debug(`[Processor] Calculated hash: ${updates.hash}`);
  }

  // Generate thumbnail if requested
  if (doThumbnail) {
    const hash = updates.hash || photo.hash;
    const thumbnailPath = await generateAndUploadThumbnail(buffer, photo.filename, hash);
    if (thumbnailPath) {
      logger.debug(`[Processor] Generated thumbnail at ${thumbnailPath}`);
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
      logger.debug(`[Processor] Generated WebP display asset at ${result.displayPath}`);
    } else if (result && !result.ok && !result.originalIsHeic) {
      updates.display_path = storagePath;
      logger.debug(`[Processor] WebP failed; falling back display_path to original ${storagePath}`);
    }
  }

  // Update database
  await db('photos').where({ id: photoId }).update(updates);
  logger.info(`[Processor] Updated photo ${photoId} with processed metadata`);

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
  generateAndUploadDisplayWebp,
  hashBuffer
};
