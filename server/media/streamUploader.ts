// @ts-nocheck

/**
 * Streaming upload module for direct-to-Supabase file uploads.
 * 
 * This module eliminates disk I/O by streaming multipart data directly
 * to Supabase Storage, acting as a pass-through proxy.
 * 
 * Design goals:
 * 1. Zero disk I/O - No writing to os.tmpdir()
 * 2. Memory safety - Stream data without buffering entire files
 * 3. Validation - Enforce file size and MIME type checks during streaming
 */

const Busboy = require('busboy');
const crypto = require('crypto');
const path = require('path');
const { PassThrough, Transform } = require('stream');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
  'image/webp'
];

function isUnknownClaimedMimeType(mimetype) {
  const normalized = String(mimetype || '').toLowerCase().trim();
  return normalized === '' || normalized === 'application/octet-stream';
}

function isAllowedMimeType(mimetype) {
  if (!mimetype) return false;
  const normalized = String(mimetype).toLowerCase().trim();
  return ALLOWED_MIME_TYPES.includes(normalized);
}

function isHeicFamily(mimetype) {
  const normalized = String(mimetype || '').toLowerCase().trim();
  return normalized === 'image/heic' || normalized === 'image/heif';
}

function detectImageMimeFromMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: "GIF87a" or "GIF89a"
  if (buffer.length >= 6) {
    const head6 = buffer.slice(0, 6).toString('ascii');
    if (head6 === 'GIF87a' || head6 === 'GIF89a') {
      return 'image/gif';
    }
  }

  // WEBP: RIFF....WEBP
  if (buffer.length >= 12) {
    const riff = buffer.slice(0, 4).toString('ascii');
    const webp = buffer.slice(8, 12).toString('ascii');
    if (riff === 'RIFF' && webp === 'WEBP') {
      return 'image/webp';
    }
  }

  // BMP: "BM"
  if (buffer.length >= 2) {
    const bm = buffer.slice(0, 2).toString('ascii');
    if (bm === 'BM') {
      return 'image/bmp';
    }
  }

  // TIFF: "II*\0" or "MM\0*"
  if (buffer.length >= 4) {
    if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) {
      return 'image/tiff';
    }
    if (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a) {
      return 'image/tiff';
    }
  }

  // HEIC/HEIF: ISO BMFF brands via ftyp box
  // Offset 4-7 should be 'ftyp', then major brand at 8-11.
  if (buffer.length >= 12 && buffer.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.slice(8, 12).toString('ascii');
    const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
    const heifBrands = new Set(['heif', 'mif1', 'msf1']);

    if (heicBrands.has(brand) || heifBrands.has(brand)) {
      // NOTE: Some HEIC files use the generic 'mif1' brand.
      // Treat both image/heic and image/heif as acceptable for validation.
      return heicBrands.has(brand) ? 'image/heic' : 'image/heif';
    }
  }

  return null;
}

/**
 * Stream validator transform that enforces file size limits.
 * Emits an error if the cumulative bytes exceed the maximum.
 */
class SizeLimiter extends Transform {
  constructor(maxBytes) {
    super();
    this.maxBytes = maxBytes;
    this.bytesReceived = 0;
  }

  _transform(chunk, encoding, callback) {
    this.bytesReceived += chunk.length;
    if (this.bytesReceived > this.maxBytes) {
      const err = new Error('File too large');
      err.code = 'LIMIT_FILE_SIZE';
      callback(err);
      return;
    }
    callback(null, chunk);
  }

  getTotalBytes() {
    return this.bytesReceived;
  }
}

/**
 * Stream hasher that calculates SHA256 hash while passing through data.
 * Supports user-scoped hashing by appending userEmail to the hash input.
 */
class HashingStream extends Transform {
  constructor(userEmail = null) {
    super();
    this.hash = crypto.createHash('sha256');
    this.userEmail = userEmail;
  }

  _transform(chunk, encoding, callback) {
    this.hash.update(chunk);
    callback(null, chunk);
  }

  getHash() {
    // If userEmail is provided, append it to create a user-scoped hash
    // This allows the same photo to be owned by different users
    if (this.userEmail) {
      this.hash.update(this.userEmail);
    }
    return this.hash.digest('hex');
  }
}

class MagicByteSniffer extends Transform {
  constructor({ claimedMime, peekBytes = 64 }) {
    super();
    this.claimedMime = String(claimedMime || '').toLowerCase().trim();
    this.claimedMimeUnknown = isUnknownClaimedMimeType(this.claimedMime);
    this.peekBytes = peekBytes;
    this.bufferedChunks = [];
    this.bufferedBytes = 0;
    this.validated = false;
    this.detectedMime = null;
  }

  _fail(message) {
    const err = new Error(message || 'Invalid file signature');
    err.code = 'INVALID_FILE_SIGNATURE';
    this.emit('error', err);
  }

  _matchesClaimed(detectedMime) {
    if (!detectedMime) return false;
    if (this.claimedMimeUnknown) return true;
    return this.claimedMime === detectedMime || (isHeicFamily(this.claimedMime) && isHeicFamily(detectedMime));
  }

  _validateWithHead(head) {
    const detected = detectImageMimeFromMagicBytes(head);
    if (!detected) return null;
    if (!this._matchesClaimed(detected)) return null;
    if (!isAllowedMimeType(detected)) return null;
    return detected;
  }

  _flushBufferedToOutput() {
    if (this.bufferedBytes === 0) return;
    const full = Buffer.concat(this.bufferedChunks, this.bufferedBytes);
    this.bufferedChunks = [];
    this.bufferedBytes = 0;
    this.push(full);
  }

  _markValidated(detectedMime) {
    this.validated = true;
    this.detectedMime = detectedMime;
    this.emit('validated', detectedMime);
  }

  _transform(chunk, encoding, callback) {
    if (this.validated) {
      callback(null, chunk);
      return;
    }

    this.bufferedChunks.push(chunk);
    this.bufferedBytes += chunk.length;

    if (this.bufferedBytes < this.peekBytes) {
      callback();
      return;
    }

    const head = Buffer.concat(this.bufferedChunks, this.bufferedBytes);
    const detected = this._validateWithHead(head);
    if (!detected) {
      callback(Object.assign(new Error('Invalid file signature'), { code: 'INVALID_FILE_SIGNATURE' }));
      return;
    }

    this._markValidated(detected);
    this._flushBufferedToOutput();
    callback();
  }

  _flush(callback) {
    if (this.validated) {
      callback();
      return;
    }

    // Preserve historical semantics for empty uploads: let downstream detect EMPTY_FILE.
    if (this.bufferedBytes === 0) {
      const fallbackMime = isAllowedMimeType(this.claimedMime) ? this.claimedMime : 'application/octet-stream';
      this._markValidated(fallbackMime);
      callback();
      return;
    }

    const head = Buffer.concat(this.bufferedChunks, this.bufferedBytes);
    const detected = this._validateWithHead(head);
    if (!detected) {
      callback(Object.assign(new Error('Invalid file signature'), { code: 'INVALID_FILE_SIGNATURE' }));
      return;
    }

    this._markValidated(detected);
    this._flushBufferedToOutput();
    callback();
  }
}

/**
 * Validates MIME type for image uploads.
 * @param {string} mimetype - The MIME type to validate
 * @param {string} filename - The original filename
 * @returns {boolean} True if valid image type
 */
function isValidImageType(mimetype, filename) {
  void filename; // extensions are not trusted for security decisions
  return isAllowedMimeType(mimetype);
}

/**
 * Sanitizes filename for safe storage.
 * @param {string} originalname - Original filename from upload
 * @returns {string} Sanitized filename with UUID prefix
 */
function sanitizeFilename(originalname) {
  const sanitizedOriginal = path.basename(originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniquePrefix = crypto.randomUUID();
  return `${uniquePrefix}-${sanitizedOriginal}`;
}

/**
 * Parses multipart form data and streams file directly to Supabase Storage.
 * 
 * This is the core streaming upload function that:
 * 1. Parses the multipart request using Busboy
 * 2. Validates MIME type and file size during streaming
 * 3. Calculates file hash during streaming
 * 4. Pipes directly to Supabase Storage (no disk writes)
 * 
 * @param {Object} req - Express request object
 * @param {Object} options - Upload options
 * @param {number} options.maxFileSize - Maximum file size in bytes
 * @param {string} options.fieldName - Expected field name for file (default: 'photo')
 * @param {string} options.bucket - Supabase Storage bucket (default: 'photos')
 * @param {string} options.pathPrefix - Storage path prefix (default: 'working')
 * @param {string} options.storagePath - Explicit storage path override
 * @param {boolean} options.upsert - Allow overwrite (default: false)
 * @param {string} options.cacheControl - Cache-Control header (default: '31536000')
 * @returns {Promise<Object>} Upload result with filename, hash, path, size
 */
async function streamToSupabase(req, options = {}) {
  const maxFileSize = options.maxFileSize || Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
  const fieldName = options.fieldName || 'photo';
  const userEmail = options.userEmail || null; // User email for scoped hashing
  const bucket = options.bucket || 'photos';
  const pathPrefix = options.pathPrefix || 'working';
  const storagePathOverride = options.storagePath || null;
  const allowUpsert = options.upsert === true;
  const cacheControl = options.cacheControl || '31536000';

  return new Promise((resolve, reject) => {
    // Check content-type before creating busboy
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      const err = new Error('No file uploaded');
      err.code = 'NO_FILE';
      return reject(err);
    }

    let fileFound = false;
    let photoUploadPromise = null;
    let uploadError = null;

    // Capture lightweight non-file fields from multipart form.
    // Keep this scoped and small to avoid memory issues.
    const fields = {};
    
    // Thumbnail state
    let thumbnailBuffer = [];
    let thumbnailSize = 0;
    let thumbnailMime = null;
    let thumbnailTooLarge = false;

    let busboy;
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: maxFileSize,
          files: 2 // Allow photo + thumbnail
        }
      });
    } catch {
      // Busboy throws for unsupported content types
      const noFileErr = new Error('No file uploaded');
      noFileErr.code = 'NO_FILE';
      return reject(noFileErr);
    }

    busboy.on('file', (name, fileStream, info) => {
      const { filename: originalname, mimeType: mimetype } = info;

      // Handle Main Photo
      if (name === fieldName) {
        fileFound = true;

        // Validate claimed MIME type (exact allowlist)
        const claimedMime = String(mimetype || '').toLowerCase().trim();
        const claimedUnknown = isUnknownClaimedMimeType(claimedMime);
        if (!claimedUnknown && !isValidImageType(claimedMime, originalname)) {
          fileStream.resume(); // Drain the stream
          uploadError = new Error('Only image files are allowed');
          uploadError.code = 'INVALID_MIME_TYPE';
          return;
        }

        // SECURITY: Magic-byte sniffing BEFORE uploading to Supabase.
        // Implemented as a Transform to avoid unsafe unshift() on ended streams.
        const filename = sanitizeFilename(originalname);
        const storagePath = storagePathOverride || `${pathPrefix}/${filename}`;

        const sniffer = new MagicByteSniffer({ claimedMime, peekBytes: 64 });
        const sizeLimiter = new SizeLimiter(maxFileSize);
        const hashingStream = new HashingStream(userEmail); // Pass userEmail for scoped hashing
        const passThrough = new PassThrough();

        // Handle file size limit exceeded
        sizeLimiter.on('error', (err) => {
          uploadError = err;
          try { fileStream.destroy(); } catch { /* ignore */ }
          try { passThrough.destroy(); } catch { /* ignore */ }
        });

        // Handle signature errors
        sniffer.on('error', (err) => {
          uploadError = err;
          try { fileStream.destroy(); } catch { /* ignore */ }
          try { passThrough.destroy(); } catch { /* ignore */ }
        });

        // Handle busboy's file size limit
        fileStream.on('limit', () => {
          uploadError = new Error('File too large');
          uploadError.code = 'LIMIT_FILE_SIZE';
          try { passThrough.destroy(); } catch { /* ignore */ }
        });

        // Start the upload only after the sniffer validates and identifies the content type.
        const validatedPromise = new Promise((resolve, reject) => {
          sniffer.once('validated', resolve);
          sniffer.once('error', reject);
        });

        photoUploadPromise = (async () => {
          const detectedMime = await validatedPromise;

          const { data, error } = await supabase.storage
            .from(bucket)
            .upload(storagePath, passThrough, {
              // SECURITY: Use detected content type; do not trust client-provided MIME.
              contentType: detectedMime,
              duplex: 'half', // Required for streaming uploads
              upsert: allowUpsert,
              cacheControl
            });

          if (error) {
            logger.error('Supabase streaming upload error:', error);
            const err = new Error('Failed to upload to storage');
            err.supabaseError = error;
            throw err;
          }

          // Check for empty file after upload completes
          const totalBytes = sizeLimiter.getTotalBytes();
          if (totalBytes === 0) {
            // Clean up the empty file from storage
            await supabase.storage.from(bucket).remove([storagePath]);
            const err = new Error('Empty file uploaded');
            err.code = 'EMPTY_FILE';
            throw err;
          }

          return {
            success: true,
            filename,
            originalname,
            mimetype: detectedMime,
            hash: hashingStream.getHash(),
            path: storagePath,
            bucket,
            size: totalBytes,
            supabaseData: data
          };
        })();

        photoUploadPromise.catch(err => {
          if (!uploadError) uploadError = err;
        });

        // Pipe: fileStream -> sniffer -> sizeLimiter -> hashingStream -> passThrough -> Supabase
        fileStream
          .pipe(sniffer)
          .pipe(sizeLimiter)
          .pipe(hashingStream)
          .pipe(passThrough);

      } 
      // Handle Thumbnail
      else if (name === 'thumbnail') {
        thumbnailMime = isUnknownClaimedMimeType(mimetype) ? null : mimetype;
        
        fileStream.on('data', (chunk) => {
          if (thumbnailTooLarge) return;
          
          thumbnailSize += chunk.length;
          if (thumbnailSize > 200 * 1024) { // 200KB limit
            thumbnailTooLarge = true;
            thumbnailBuffer = []; // Discard buffer to save memory
          } else {
            thumbnailBuffer.push(chunk);
          }
        });
        
        fileStream.on('limit', () => {
           thumbnailTooLarge = true;
           thumbnailBuffer = [];
        });
      } 
      // Ignore other fields
      else {
        fileStream.resume();
      }
    });

    busboy.on('field', (name, value) => {
      // Capture lightweight non-file fields (e.g. classification, collectibleId)
      // so they are available to the upload route after streaming finishes.
      try {
        const key = typeof name === 'string' ? name : String(name);
        if (!key) return;

        const raw = typeof value === 'string' ? value : String(value);
        // Keep this small to avoid memory issues / abuse.
        fields[key] = raw.slice(0, 256);
      } catch {
        // ignore malformed field
      }
    });

    busboy.on('filesLimit', () => {
      uploadError = new Error('Too many files');
      uploadError.code = 'LIMIT_FILES';
    });

    busboy.on('error', (err) => {
      logger.error('Busboy parsing error:', err);
      uploadError = err;
    });

    busboy.on('finish', async () => {
      if (uploadError) {
        reject(uploadError);
        return;
      }

      if (!fileFound) {
        const err = new Error('No file uploaded');
        err.code = 'NO_FILE';
        reject(err);
        return;
      }

      try {
        // Wait for the main photo upload to complete
        if (!photoUploadPromise) {
           reject(new Error('Upload failed to start'));
           return;
        }

        const result = await photoUploadPromise;

        // Handle Thumbnail Upload (Best Effort)
        if (result && result.hash && thumbnailBuffer.length > 0 && !thumbnailTooLarge) {
          try {
            const fullThumbnailBuffer = Buffer.concat(thumbnailBuffer);
            const thumbPath = `thumbnails/${result.hash}.webp`;
            
            await supabase.storage.from('photos').upload(thumbPath, fullThumbnailBuffer, {
              contentType: thumbnailMime || 'image/webp',
              upsert: true,
              cacheControl: '31536000'
            });
          } catch (thumbErr) {
            logger.error('Thumbnail upload failed (non-fatal):', thumbErr);
          }
        }

        resolve({ ...result, fields });
      } catch (err) {
        logger.error('Stream upload error:', err);
        reject(err);
      }
    });

    // Pipe request to busboy
    req.pipe(busboy);
  });
}

/**
 * Express middleware for streaming uploads.
 * Sets req.streamedFile with upload result on success.
 */
function streamingUploadMiddleware(options = {}) {
  return async (req, res, next) => {
    try {
      const result = await streamToSupabase(req, options);
      req.streamedFile = result;
      next();
    } catch (err) {
      // Handle specific error types
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
      
      logger.error('Streaming upload middleware error:', err);
      return res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
  };
}

module.exports = {
  streamToSupabase,
  streamingUploadMiddleware,
  sanitizeFilename,
  isValidImageType,
  detectImageMimeFromMagicBytes,
  MagicByteSniffer,
  SizeLimiter,
  HashingStream,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_MIME_TYPES
};
