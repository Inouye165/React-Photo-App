const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const exifr = require('exifr');
const nodeCrypto = require('crypto');
const heicConvert = require('heic-convert');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

async function hashFile(filePath) {
  const buf = await fs.readFile(filePath);
  return nodeCrypto.createHash('sha256').update(buf).digest('hex');
}


async function generateThumbnail(filePath, hash, thumbDir) {
  const thumbPath = path.join(thumbDir, `${hash}.jpg`);
  try {
    await fs.access(thumbPath);
    return thumbPath;
  } catch {
    // File doesn't exist, continue with generation
  }
  try {
    // Reduced size by 25%: original 120 -> now 90
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.heic' || ext === '.heif') {
      // Convert HEIC/HEIF to JPEG buffer first using the robust converter (sharp -> ImageMagick fallback)
      try {
        const jpegBuffer = await convertHeicToJpegBuffer(filePath, 70);
        await sharp(jpegBuffer)
          .resize(90, 90, { fit: 'inside' })
          .jpeg({ quality: 70 })
          .toFile(thumbPath);
      } catch (convErr) {
        console.error('Sharp thumbnail generation (via HEIC->JPEG) failed for', filePath, convErr.message || convErr);
        return null;
      }
    } else {
      await sharp(filePath)
        .resize(90, 90, { fit: 'inside' })
        .jpeg({ quality: 70 })
        .toFile(thumbPath);
    }
    return thumbPath;
  } catch (err) {
    console.error('Sharp thumbnail generation failed for', filePath, err.message || err);
    return null;
  }
}

async function convertHeicToJpegBuffer(filePath, quality = 90) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.heic' && ext !== '.heif') {
    // If already JPEG/PNG, read as buffer
    return fsSync.readFileSync(filePath);
  }
  try {
    console.log('[CONVERT] Attempting HEIC->JPEG conversion for', filePath);
    const buffer = await sharp(filePath).jpeg({ quality }).toBuffer();
    console.log('[CONVERT] HEIC->JPEG conversion successful for', filePath, 'buffer size:', buffer.length);
    return buffer;
  } catch (err) {
    // This is the NEW catch block
    console.log('[CONVERT] Sharp conversion failed, trying heic-convert fallback for', filePath, err.message);
    try {
      // 'fs' at the top of the file is fs.promises
      const inputBuffer = await fs.readFile(filePath); 
      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: quality / 100 // heic-convert quality is 0 to 1
      });
      console.log('[CONVERT] heic-convert fallback successful for', filePath, 'buffer size:', outputBuffer.length);
      return outputBuffer;
    } catch (fallbackErr) {
      console.error('[CONVERT] heic-convert fallback conversion FAILED for', filePath, fallbackErr.message || fallbackErr);
      // Throw a single, clear error
      throw new Error(`HEIC conversion failed for ${filePath}. Sharp error: ${err.message}, Fallback error: ${fallbackErr.message}`);
    }
  }
}



async function ensureAllThumbnails(db, WORKING_DIR, THUMB_DIR) {
  const files = await fs.readdir(WORKING_DIR);
  // Limit concurrent conversions to avoid spawning too many ImageMagick/sharp processes
  const CONCURRENCY_LIMIT = parseInt(process.env.THUMB_CONCURRENCY || '2', 10);
  const queue = [];
  for (const filename of files) {
    const filePath = path.join(WORKING_DIR, filename);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) continue;
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM photos WHERE filename = ?', [filename], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (row && row.hash) {
      const job = async () => {
        try {
          await generateThumbnail(filePath, row.hash, THUMB_DIR);
        } catch (e) {
          console.error('Thumbnail gen error for', filename, e && (e.message || e));
        }
      };
      queue.push(job);
    }
  }

  // Run the queue with limited concurrency
  const workers = new Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
    while (queue.length > 0) {
      const job = queue.shift();
       
      await job();
    }
  });
  await Promise.all(workers);
}

async function ensureAllFilesHashed(db, WORKING_DIR, THUMB_DIR) {
  const files = await fs.readdir(WORKING_DIR);
  const ignored = [];
  const STARTUP_LIMIT = parseInt(process.env.STARTUP_THUMB_LIMIT || '50', 10);
  let processedCount = 0;
  for (const filename of files) {
    if (processedCount >= STARTUP_LIMIT) {
      console.log(`[STARTUP] Reached startup processing limit of ${STARTUP_LIMIT} files; skipping remaining files for now.`);
      break;
    }
    const filePath = path.join(WORKING_DIR, filename);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) continue;
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      // Log and skip non-image files (desktop.ini, thumbs.db, etc.) rather than exiting
      ignored.push(filename);
      continue;
    }
    // By default, avoid processing HEIC/HEIF files at startup because some environments
    // (Windows/libvips builds) don't support HEIC and conversions can be expensive
    // and may spawn ImageMagick processes. To enable startup processing of HEIC files,
    // set STARTUP_PROCESS_HEIC=true in the server .env.
    const STARTUP_PROCESS_HEIC = (process.env.STARTUP_PROCESS_HEIC || 'false').toLowerCase() === 'true';
    if (!STARTUP_PROCESS_HEIC && (ext === '.heic' || ext === '.heif')) {
      // Skip heic/heif during startup and let thumbnails be generated on-demand or via a separate job
      console.log(`[STARTUP] Skipping HEIC/HEIF file at startup: ${filename} (set STARTUP_PROCESS_HEIC=true to override)`);
      continue;
    }
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM photos WHERE filename = ?', [filename], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!row) {
      await ingestPhoto(db, filePath, filename, 'working', THUMB_DIR);
      continue;
    }
    if (!row.hash) {
      const hash = await hashFile(filePath);
      db.run('UPDATE photos SET hash = ? WHERE id = ?', [hash, row.id]);
      await generateThumbnail(filePath, hash, THUMB_DIR);
      processedCount++;
    } else {
      await generateThumbnail(filePath, row.hash, THUMB_DIR);
      processedCount++;
    }
  }
  if (ignored.length > 0) {
    console.log('[WORKING DIR] Ignored non-image files:', ignored.join(', '));
    console.log('[WORKING DIR] To avoid these messages, remove or hide non-image files (e.g., desktop.ini, thumbs.db) from the working directory.');
  }
}

async function ingestPhoto(db, filePath, filename, state, thumbDir) {
  try {
    const hash = await hashFile(filePath);
    const existing = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM photos WHERE hash = ?', [hash], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (existing) {
      await fs.unlink(filePath);
      console.log(`Duplicate file skipped: ${filename}`);
      return { duplicate: true, hash };
    }
    const metadata = await exifr.parse(filePath, { tiff: true, ifd0: true, exif: true, gps: true, xmp: true, icc: true, iptc: true });
    const metaStr = JSON.stringify(metadata || {});
    const fileStats = await fs.stat(filePath);
    const fileSize = fileStats.size;
    const now = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO photos (filename, state, metadata, hash, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [filename, state, metaStr, hash, fileSize, now, now]
    );
    const td = thumbDir || path.join(__dirname, '..', 'thumbnails');
    await generateThumbnail(filePath, hash, td);
    return { duplicate: false, hash };
  } catch (err) {
    console.error('Metadata/hash extraction failed for', filename, err);
    return { duplicate: false, hash: null };
  }
}

module.exports = { generateThumbnail, ensureAllThumbnails, ensureAllFilesHashed, ingestPhoto, convertHeicToJpegBuffer };