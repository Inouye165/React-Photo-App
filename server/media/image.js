const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const crypto = require('crypto');
const exifr = require('exifr');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

function hashFileSync(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function generateThumbnail(filePath, hash, thumbDir) {
  const thumbPath = path.join(thumbDir, `${hash}.jpg`);
  if (fs.existsSync(thumbPath)) return thumbPath;
  try {
    // Reduced size by 25%: original 120 -> now 90
    await sharp(filePath)
      .resize(90, 90, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toFile(thumbPath);
    return thumbPath;
  } catch (err) {
    console.error('Sharp thumbnail generation failed for', filePath, err.message || err);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.heic' || ext === '.heif') {
      const tmpJpg = path.join(thumbDir, `${hash}.tmp.jpg`);
      // Use ImageMagick to convert and resize to 90x90
      const cmd = `magick "${filePath}" -strip -resize 90x90 -quality 70 "${tmpJpg}"`;
      try {
        await new Promise((resolve, reject) => {
          exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) return reject(new Error(stderr || stdout || error.message));
            resolve();
          });
        });
        fs.renameSync(tmpJpg, thumbPath);
        return thumbPath;
      } catch (convErr) {
        console.error('Fallback conversion failed for', filePath, convErr.message || convErr);
        try { if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg); } catch (e) {}
        return null;
      }
    }
    return null;
  }
}

async function convertHeicToJpegBuffer(filePath, quality = 90) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.heic' && ext !== '.heif') {
    // If already JPEG/PNG, read as buffer
    return fs.readFileSync(filePath);
  }
  try {
    console.log('[CONVERT] Attempting HEIC->JPEG conversion for', filePath);
    const buffer = await sharp(filePath).jpeg({ quality }).toBuffer();
    console.log('[CONVERT] HEIC->JPEG conversion successful for', filePath, 'buffer size:', buffer.length);
    return buffer;
  } catch (err) {
    console.error('[CONVERT] Sharp conversion failed for', filePath, err);
    // Fallback to ImageMagick
    const tmpJpg = filePath + '.tmp-convert.jpg';
    const cmd = `magick "${filePath}" -strip -quality ${quality} "${tmpJpg}"`;
    try {
      console.log('[CONVERT] Attempting ImageMagick HEIC->JPEG conversion for', filePath);
      await new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
          if (error) return reject(new Error(stderr || stdout || error.message));
          resolve();
        });
      });
      const buffer = fs.readFileSync(tmpJpg);
      console.log('[CONVERT] ImageMagick conversion successful for', filePath, 'buffer size:', buffer.length);
      fs.unlinkSync(tmpJpg);
      return buffer;
    } catch (convErr) {
      console.error('[CONVERT] ImageMagick fallback conversion failed for', filePath, convErr);
      try { if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg); } catch (e) {}
      throw convErr;
    }
  }
}

async function ensureAllThumbnails(db, WORKING_DIR, THUMB_DIR) {
  const files = fs.readdirSync(WORKING_DIR);
  for (const filename of files) {
    const filePath = path.join(WORKING_DIR, filename);
    if (!fs.statSync(filePath).isFile()) continue;
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
  const files = fs.readdirSync(WORKING_DIR);
  const ignored = [];
  for (const filename of files) {
    const filePath = path.join(WORKING_DIR, filename);
    if (!fs.statSync(filePath).isFile()) continue;
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
      const hash = hashFileSync(filePath);
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
    const hash = hashFileSync(filePath);
    const existing = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM photos WHERE hash = ?', [hash], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (existing) {
      fs.unlinkSync(filePath);
      console.log(`Duplicate file skipped: ${filename}`);
      return { duplicate: true, hash };
    }
    const metadata = await exifr.parse(filePath, { tiff: true, ifd0: true, exif: true, gps: true, xmp: true, icc: true, iptc: true });
    const metaStr = JSON.stringify(metadata || {});
    const fileStats = fs.statSync(filePath);
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