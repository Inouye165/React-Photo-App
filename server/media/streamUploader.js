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

/**
 * Validates MIME type for image uploads.
 * @param {string} mimetype - The MIME type to validate
 * @param {string} filename - The original filename
 * @returns {boolean} True if valid image type
 */
function isValidImageType(mimetype, filename) {
  const ext = path.extname(filename).toLowerCase();
  
  // Accept files with image MIME type or allowed image extensions
  if (mimetype && ALLOWED_MIME_TYPES.some(t => mimetype.startsWith(t.split('/')[0] + '/'))) {
    return true;
  }
  
  if (ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return true;
  }
  
  return false;
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
 * @returns {Promise<Object>} Upload result with filename, hash, path, size
 */
async function streamToSupabase(req, options = {}) {
  const maxFileSize = options.maxFileSize || Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024);
  const fieldName = options.fieldName || 'photo';
  const userEmail = options.userEmail || null; // User email for scoped hashing

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

        // Validate MIME type
        if (!isValidImageType(mimetype, originalname)) {
          fileStream.resume(); // Drain the stream
          uploadError = new Error('Only image files are allowed');
          uploadError.code = 'INVALID_MIME_TYPE';
          return;
        }

        const filename = sanitizeFilename(originalname);
        const storagePath = `working/${filename}`;

        // Create transform streams for validation and hashing
        const sizeLimiter = new SizeLimiter(maxFileSize);
        const hashingStream = new HashingStream(userEmail); // Pass userEmail for scoped hashing
        const passThrough = new PassThrough();

        // Handle file size limit exceeded
        sizeLimiter.on('error', (err) => {
          uploadError = err;
          fileStream.destroy();
          passThrough.destroy();
        });

        // Handle busboy's file size limit
        fileStream.on('limit', () => {
          uploadError = new Error('File too large');
          uploadError.code = 'LIMIT_FILE_SIZE';
          passThrough.destroy();
        });

        // Pipe: fileStream -> sizeLimiter -> hashingStream -> passThrough -> Supabase
        fileStream
          .pipe(sizeLimiter)
          .pipe(hashingStream)
          .pipe(passThrough);

        // Start the upload and store the promise
        photoUploadPromise = (async () => {
          try {
            const { data, error } = await supabase.storage
              .from('photos')
              .upload(storagePath, passThrough, {
                contentType: mimetype,
                duplex: 'half', // Required for streaming uploads
                upsert: false,
                cacheControl: '31536000' // 1 year cache for immutable content-addressed files
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
              await supabase.storage.from('photos').remove([storagePath]);
              const err = new Error('Empty file uploaded');
              err.code = 'EMPTY_FILE';
              throw err;
            }

            return {
              success: true,
              filename,
              originalname,
              mimetype,
              hash: hashingStream.getHash(),
              path: storagePath,
              size: totalBytes,
              supabaseData: data
            };
          } catch (err) {
            throw err;
          }
        })();

        // Catch errors on the promise to ensure we don't have unhandled rejections
        photoUploadPromise.catch(err => {
          if (!uploadError) uploadError = err;
        });

      } 
      // Handle Thumbnail
      else if (name === 'thumbnail') {
        thumbnailMime = mimetype;
        
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
            const thumbPath = `thumbnails/${result.hash}.jpg`;
            
            await supabase.storage.from('photos').upload(thumbPath, fullThumbnailBuffer, {
              contentType: thumbnailMime || 'image/jpeg',
              upsert: true,
              cacheControl: '31536000'
            });
          } catch (thumbErr) {
            logger.error('Thumbnail upload failed (non-fatal):', thumbErr);
          }
        }

        resolve(result);
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
  SizeLimiter,
  HashingStream,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_MIME_TYPES
};
