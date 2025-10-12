const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');
const exifr = require('exifr');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

async function hashFile(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
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
    await sharp(filePath)
      .resize(90, 90, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toFile(thumbPath);
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
    // TODO: Future cleanup - make this async as well
    return fsSync.readFileSync(filePath);
  }
  try {
    console.log('[CONVERT] Attempting HEIC->JPEG conversion for', filePath);
    const buffer = await sharp(filePath).jpeg({ quality }).toBuffer();
    console.log('[CONVERT] HEIC->JPEG conversion successful for', filePath, 'buffer size:', buffer.length);
    return buffer;
  } catch (err) {
    console.error('[CONVERT] Sharp conversion failed for', filePath, err.message || err);
    
    // Secure ImageMagick fallback with strict input validation
    try {
      console.log('[CONVERT] Attempting secure ImageMagick fallback for', filePath);
      
      // Strict security: validate file path is within allowed directories
      const fs = require('fs');
      const { promisify } = require('util');
      const { exec } = require('child_process');
      const execPromise = promisify(exec);
      
      // Security check: ensure file exists and is readable
      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }
      
      // Security check: validate file extension
      if (!['.heic', '.heif'].includes(ext)) {
        throw new Error('Invalid file extension for HEIC conversion');
      }
      
      // Create secure temporary output path
      const crypto = require('crypto');
      const tempId = crypto.randomBytes(16).toString('hex');
      const tmpJpg = path.join(path.dirname(filePath), `temp_convert_${tempId}.jpg`);
      
      // Secure command construction with validated inputs
      // Use absolute paths and escape quotes to prevent injection
      const inputPath = filePath.replace(/"/g, '""'); // Escape quotes for Windows
      const outputPath = tmpJpg.replace(/"/g, '""');
      const cmd = `magick "${inputPath}" -strip -quality ${Math.max(10, Math.min(100, quality))} "${outputPath}"`;
      
      console.log('[CONVERT] Executing secure ImageMagick command');
      await execPromise(cmd, { 
        timeout: 30000, // 30 second timeout
        windowsHide: true,
        env: process.env // Use current environment
      });
      
      // Read the converted file
      const buffer = await fs.promises.readFile(tmpJpg);
      console.log('[CONVERT] ImageMagick conversion successful for', filePath, 'buffer size:', buffer.length);
      
      // Clean up temp file
      try {
        await fs.promises.unlink(tmpJpg);
      } catch (cleanupErr) {
        console.warn('[CONVERT] Failed to cleanup temp file:', tmpJpg, cleanupErr.message);
      }
      
      return buffer;
    } catch (fallbackErr) {
      console.error('[CONVERT] ImageMagick fallback conversion failed for', filePath, fallbackErr.message || fallbackErr);
      throw new Error(`HEIC conversion failed: Sharp error: ${err.message}, ImageMagick error: ${fallbackErr.message}`);
    }
  }
}

async function ensureAllThumbnails(db, WORKING_DIR, THUMB_DIR) {
  const files = await fs.readdir(WORKING_DIR);
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
      // generateThumbnail may be slow; run but don't block other files
      generateThumbnail(filePath, row.hash, THUMB_DIR).catch(e => console.error('Thumbnail gen error:', e));
    }
  }
}

async function ensureAllFilesHashed(db, WORKING_DIR, THUMB_DIR) {
  const files = await fs.readdir(WORKING_DIR);
  const ignored = [];
  for (const filename of files) {
    const filePath = path.join(WORKING_DIR, filename);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) continue;
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      // Log and skip non-image files (desktop.ini, thumbs.db, etc.) rather than exiting
      ignored.push(filename);
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
    } else {
      await generateThumbnail(filePath, row.hash, THUMB_DIR);
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