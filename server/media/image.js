const sharp = require('sharp');
const path = require('path');
const os = require('os');
const exifr = require('exifr');
const nodeCrypto = require('crypto');
const heicConvert = require('heic-convert');
const fs = require('fs');
const fsPromises = require('fs').promises;
const supabase = require('../lib/supabaseClient');
const { validateSafePath } = require('../utils/pathValidator');

// ============================================================================
// CONCURRENCY LIMITING FOR IMAGE PROCESSING (DoS Protection)
// ============================================================================
// We use a custom Semaphore class to prevent resource exhaustion from 
// concurrent heavy image processing operations (HEIC conversion, thumbnail 
// generation). This protects against denial-of-service attacks where an 
// attacker floods the upload endpoint with complex image files.
// ============================================================================

/**
 * Simple Semaphore/Limiter class for controlling concurrent async operations.
 * Provides p-limit compatible API without ESM import issues.
 */
class ConcurrencyLimiter {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentCount = 0;
    this.queue = [];
  }

  /**
   * Execute a function with concurrency limiting.
   * Returns a function that wraps the provided async function.
   * @param {Function} fn - Async function to execute
   * @returns {Promise} - Promise resolving to fn's result
   */
  limit(fn) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.currentCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.currentCount--;
          this.processQueue();
        }
      };

      if (this.currentCount < this.maxConcurrency) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  processQueue() {
    if (this.queue.length > 0 && this.currentCount < this.maxConcurrency) {
      const next = this.queue.shift();
      next();
    }
  }

  // Return current queue stats (useful for monitoring/testing)
  getStats() {
    return {
      active: this.currentCount,
      pending: this.queue.length,
      maxConcurrency: this.maxConcurrency
    };
  }
}

// Configure concurrency limit based on CPU cores (min 1, max 2)
// We keep this low to prevent resource exhaustion
const cpuCount = os.cpus().length;
const maxConcurrency = Math.min(Math.max(1, Math.floor(cpuCount / 2)), 2);
const imageProcessingLimiter = new ConcurrencyLimiter(maxConcurrency);

/**
 * Get the concurrency limiter instance.
 * Returns a function compatible with p-limit API.
 * @returns {Function} The limiter function
 */
function getImageProcessingLimit() {
  return (fn) => imageProcessingLimiter.limit(fn);
}

// Configure sharp for constrained resource usage
// Limit libvips thread pool to prevent CPU exhaustion per request
sharp.concurrency(1);
// Disable sharp cache to reduce memory pressure (or set small limit)
sharp.cache({ memory: 50, files: 10, items: 100 });

/**
 * Compute SHA256 hash of file content, optionally scoped to a user.
 * When userEmail is provided, the hash becomes user-specific, allowing
 * the same photo to be owned by multiple users.
 * 
 * @param {Buffer|string} input - File buffer or file path
 * @param {string} [userEmail] - User email for scoped hashing (optional)
 * @returns {Promise<string>} Hex-encoded SHA256 hash
 */
async function hashFile(input, userEmail = null) {
  if (Buffer.isBuffer(input)) {
    const hash = nodeCrypto.createHash('sha256').update(input);
    if (userEmail) {
      hash.update(userEmail);
    }
    return hash.digest('hex');
  }
  // Assume input is a file path
  return new Promise((resolve, reject) => {
    const hash = nodeCrypto.createHash('sha256');
    try {
      const realPath = validateSafePath(input);
      const stream = fs.createReadStream(realPath);
      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => {
        // Append userEmail to hash if provided for user-scoped deduplication
        if (userEmail) {
          hash.update(userEmail);
        }
        resolve(hash.digest('hex'));
      });
    } catch (err) {
      return reject(err);
    }
  });
}


async function generateThumbnail(input, hash) {
  const thumbnailPath = `thumbnails/${hash}.jpg`;
  
  try {
    // Check if thumbnail already exists in Supabase Storage
    const { data: existingThumbnail } = await supabase.storage
      .from('photos')
      .list('thumbnails', { search: `${hash}.jpg` });
    
    if (existingThumbnail && existingThumbnail.length > 0) {
      return thumbnailPath; // Thumbnail already exists
    }
  } catch {
    // thumbnail existence check failed (logging removed)
  }

  // Wrap heavy image processing in concurrency limiter to prevent DoS
  const limit = getImageProcessingLimit();
  
  return limit(async () => {
    try {
      // Detect file type from buffer/file
      let sanitizedInput = input;
      if (typeof input === 'string') {
        const safeFilename = path.basename(input);
        const safeDir = os.tmpdir();
        sanitizedInput = path.join(safeDir, safeFilename);
      }

      const metadata = await sharp(sanitizedInput).metadata();
      const format = metadata.format;
      
      let thumbnailBuffer;
      if (format === 'heif') {
        // Convert HEIC/HEIF to JPEG buffer first
        try {
          const jpegBuffer = await convertHeicToJpegBufferInternal(sanitizedInput, 90);
          thumbnailBuffer = await sharp(jpegBuffer)
            .resize(400, 400, { fit: 'inside' })
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch {
          // Sharp thumbnail generation failed (logging removed)
          return null;
        }
      } else {
        thumbnailBuffer = await sharp(sanitizedInput)
          .resize(400, 400, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer();
      }

      // Upload thumbnail to Supabase Storage
      const { data: _data, error } = await supabase.storage
        .from('photos')
        .upload(thumbnailPath, thumbnailBuffer, {
          contentType: 'image/jpeg',
          duplex: false
        });

      if (error) {
          // Failed to upload thumbnail to Supabase (logging removed)
        return null;
      }

      return thumbnailPath;
    } catch {
      // Thumbnail generation failed (logging removed)
      return null;
    }
  }); // End of limit() wrapper
}


/**
 * Internal HEIC conversion function - no concurrency limiting.
 * Used internally by generateThumbnail (which already has its own limiter).
 */
async function convertHeicToJpegBufferInternal(input, quality = 90) {
  // Accept either a Buffer or a file path string. If a path is provided, sanitize and read it into a Buffer.
  let inputBuffer = input;
  if (typeof input === 'string') {
    try {
      // Allow override of allowedDirs, e.g. via env.TEST_IMAGE_DIR or process global for tests
      let allowedDirs = [
        path.resolve(__dirname, '../working'),
        path.resolve(os.tmpdir())
      ];
      if (process.env.TEST_IMAGE_DIR) {
        allowedDirs.push(path.resolve(process.env.TEST_IMAGE_DIR));
      }

      // Resolve the input path
      const resolvedPath = path.resolve(input);

      // Pre-check: Ensure resolved path starts with one of the allowed dirs
      // This prevents passing obviously malicious paths to realpath
      const preCheckSafe = allowedDirs.some(dir => {
        const base = dir.endsWith(path.sep) ? dir : dir + path.sep;
        return resolvedPath === dir || resolvedPath.startsWith(base);
      });

      if (!preCheckSafe) {
        throw new Error(`File path ${input} is outside the allowed directories (pre-check)`);
      }

      // Get the real path (resolves symlinks)
      const realPath = await fsPromises.realpath(resolvedPath);

      // Resolve allowed directories to their real paths for comparison
      const realAllowedDirs = await Promise.all(allowedDirs.map(async dir => {
        try {
          return await fsPromises.realpath(dir);
        } catch {
          return dir;
        }
      }));
      
      // Explicitly check if the real path starts with any of the allowed directories
      const isSafe = realAllowedDirs.some(dir => {
        const base = dir.endsWith(path.sep) ? dir : dir + path.sep;
        return realPath === dir || realPath.startsWith(base);
      });
      
      if (!isSafe) {
        throw new Error(`File path ${input} is outside the allowed directories`);
      }

      inputBuffer = await fsPromises.readFile(realPath);
    } catch (readErr) {
      throw new Error(`Unable to read file: ${readErr.message}`);
    }
  }

  // Attempt to read metadata using a single sharp instance. If metadata can't be determined,
  // treat input as non-HEIF and return the original buffer (do not attempt conversion).
  let metadata;
  const s = sharp(inputBuffer);
  try {
    metadata = await s.metadata();
  } catch {
    // If sharp can't read metadata treat as non-HEIF and return original buffer.
    return inputBuffer;
  }

  if (metadata.format !== 'heif') {
    // Not a HEIF file — return original buffer
    return inputBuffer;
  }

  try {
    const buffer = await s.jpeg({ quality }).withMetadata().toBuffer();
    return buffer;
  } catch (err) {
    try {
      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: quality / 100 // heic-convert quality is 0 to 1
      });
      return outputBuffer;
    } catch (fallbackErr) {
      // Error message intentionally follows the format used in tests:
      // "Sharp error: <msg>, Fallback error: <msg>" and references
      // "heic-convert fallback" in comments above.
      throw new Error(`HEIC conversion failed. Sharp error: ${err.message}, Fallback error: ${fallbackErr.message}`);
    }
  }
}

/**
 * Public HEIC conversion function with concurrency limiting.
 * Wraps the internal function with the limiter to prevent DoS attacks.
 */
async function convertHeicToJpegBuffer(input, quality = 90) {
  const limit = getImageProcessingLimit();
  return limit(() => convertHeicToJpegBufferInternal(input, quality));
}



async function ensureAllThumbnails(db) {
  // Get all photos from database
  const photos = await db('photos').select('id', 'filename', 'hash', 'state', 'storage_path');
  
  // Limit concurrent conversions to avoid spawning too many processes
  const CONCURRENCY_LIMIT = parseInt(process.env.THUMB_CONCURRENCY || '2', 10);
  const queue = [];
  
  for (const photo of photos) {
    if (photo.hash) {
      const job = async () => {
        try {
          // Download file from Supabase Storage
          const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;
          const { data: fileData, error } = await supabase.storage
            .from('photos')
            .download(storagePath);
          
          if (error) {
              // Failed to download ${storagePath} for thumbnail generation (logging removed)
            return;
          }
          
          const fileBuffer = await fileData.arrayBuffer();
          await generateThumbnail(Buffer.from(fileBuffer), photo.hash);
        } catch {
          // Thumbnail gen error for ${photo.filename} (logging removed)
        }
      };
      queue.push(job);
    }
  }

  // Run the queue with limited concurrency
  const workers = new Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (job) await job();
    }
  });
  await Promise.all(workers);
}

/**
 * Ingest a photo into the database with user-scoped deduplication.
 * 
 * @param {Object} db - Knex database instance
 * @param {string} storagePath - Path in storage bucket
 * @param {string} filename - Original filename
 * @param {string} state - Photo state (working, inprogress, etc.)
 * @param {Buffer|string} input - File buffer or path
 * @param {string} userId - User UUID
 * @param {string} [userEmail] - User email for scoped hashing (optional but recommended)
 * @returns {Promise<Object>} Result with duplicate flag and hash
 */
async function ingestPhoto(db, storagePath, filename, state, input, userId, userEmail = null) {
  if (!userId) {
    throw new Error('userId is required for ingestPhoto');
  }
  try {
    // Use user-scoped hash if email is provided, otherwise fall back to content-only hash
    const hash = await hashFile(input, userEmail);
    const existing = await db('photos').where({ hash }).select('id').first();
    if (existing) {
        // Duplicate file skipped (logging removed)
      return { duplicate: true, hash };
    }
    
    let sanitizedInput = input;
    if (typeof input === 'string') {
      const safeFilename = path.basename(input);
      const safeDir = os.tmpdir();
      sanitizedInput = path.join(safeDir, safeFilename);
    }

    const metadata = await exifr.parse(sanitizedInput, { 
      tiff: true, ifd0: true, exif: true, gps: true, xmp: true, icc: true, iptc: true 
    });
    const metaStr = JSON.stringify(metadata || {});
    
    // Get file size
    let fileSize = 0;
    if (Buffer.isBuffer(input)) {
      fileSize = input.length;
    } else {
      const stats = await fsPromises.stat(sanitizedInput);
      fileSize = stats.size;
    }

    const now = new Date().toISOString();
    
    await db('photos').insert({
      filename,
      state,
      metadata: metaStr,
      hash,
      file_size: fileSize,
      storage_path: storagePath,
      user_id: userId,
      created_at: now,
      updated_at: now
    }).onConflict('filename').merge();
    
    await generateThumbnail(input, hash);
    return { duplicate: false, hash };
  } catch {
    // Metadata/hash extraction failed for file (logging removed)
    return { duplicate: false, hash: null };
  }
}

module.exports = { 
  generateThumbnail, 
  ensureAllThumbnails, 
  ingestPhoto, 
  convertHeicToJpegBuffer,
  // Export for testing concurrency behavior
  getImageProcessingLimit,
  // Export the limiter class and instance for testing
  ConcurrencyLimiter,
  imageProcessingLimiter,
  // Export internal function for unit tests that need to bypass concurrency limiting
  _internal: {
    convertHeicToJpegBufferInternal
  }
};