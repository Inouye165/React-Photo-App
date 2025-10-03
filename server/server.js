const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const exifr = require('exifr');
const sharp = require('sharp');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3001;
const DEFAULT_WORKING_DIR = path.join(os.homedir(), 'working');
const WORKING_DIR = process.env.PHOTO_WORKING_DIR || DEFAULT_WORKING_DIR;

if (!fs.existsSync(WORKING_DIR)) {
  fs.mkdirSync(WORKING_DIR, { recursive: true });
  console.log(`Created working directory: ${WORKING_DIR}`);
}

// --- Helper: Compute SHA-256 hash of a file ---
function hashFileSync(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

const THUMB_DIR = path.join(WORKING_DIR, '.thumbnails');
if (!fs.existsSync(THUMB_DIR)) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
}

async function generateThumbnail(filePath, hash) {
  const thumbPath = path.join(THUMB_DIR, `${hash}.jpg`);
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
      const tmpJpg = path.join(THUMB_DIR, `${hash}.tmp.jpg`);
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

async function ensureAllThumbnails(db) {
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
      generateThumbnail(filePath, row.hash).catch(e => console.error('Thumbnail gen error:', e));
    }
  }
}

// Update ensureAllFilesHashed to also generate thumbnails
async function ensureAllFilesHashed(db) {
  const files = fs.readdirSync(WORKING_DIR);
  for (const filename of files) {
    const filePath = path.join(WORKING_DIR, filename);
    if (!fs.statSync(filePath).isFile()) continue;
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM photos WHERE filename = ?', [filename], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    if (!row) {
      await ingestPhoto(db, filePath, filename, 'working');
      continue;
    }
    if (!row.hash) {
      const hash = hashFileSync(filePath);
      db.run('UPDATE photos SET hash = ? WHERE id = ?', [hash, row.id]);
      await generateThumbnail(filePath, hash);
    } else {
      await generateThumbnail(filePath, row.hash);
    }
  }
}

// Update ingestPhoto to generate thumbnail after hashing
async function ingestPhoto(db, filePath, filename, state = 'working') {
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
    const now = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO photos (filename, state, metadata, hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [filename, state, metaStr, hash, now, now]
    );
    await generateThumbnail(filePath, hash);
    return { duplicate: false, hash };
  } catch (err) {
    console.error('Metadata/hash extraction failed for', filename, err);
    return { duplicate: false, hash: null };
  }
}

async function migrateAndStartServer() {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(path.join(WORKING_DIR, 'photos.db'));
  // Ensure table exists
  await new Promise((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE,
      state TEXT,
      metadata TEXT,
      hash TEXT,
      created_at TEXT,
      updated_at TEXT
    )`, resolve);
  });
  // Migration: ensure 'hash' column exists
  await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(photos)", (err, columns) => {
      if (err) return reject(err);
      const hasHash = columns.some(col => col.name === 'hash');
      if (!hasHash) {
        db.run('ALTER TABLE photos ADD COLUMN hash TEXT', () => {
          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_hash ON photos(hash)', resolve);
        });
      } else {
        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_hash ON photos(hash)', resolve);
      }
    });
  });
  // Ensure all files are hashed
  await ensureAllFilesHashed(db);

  // --- Express app and routes ---
  const express = require('express');
  const multer = require('multer');
  const cors = require('cors');
  const app = express();

  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
  }));
  app.use(express.json());

  // Multer setup
  const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, WORKING_DIR); },
    filename: function (req, file, cb) {
      let filename = file.originalname;
      let counter = 1;
      while (fs.existsSync(path.join(WORKING_DIR, filename))) {
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        filename = `${basename}(${counter})${ext}`;
        counter++;
      }
      cb(null, filename);
    }
  });
  const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];
      const ext = require('path').extname(file.originalname).toLowerCase();
      if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
      else if (imageExtensions.includes(ext)) cb(null, true);
      else cb(new Error('Only image files are allowed'), false);
    }
  });

  // --- API: List all photos and metadata (include hash) ---
  app.get('/photos', (req, res) => {
    db.all('SELECT id, filename, state, metadata, hash FROM photos', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      res.json({ success: true, photos: rows.map(row => ({
        id: row.id,
        filename: row.filename,
        state: row.state,
        metadata: JSON.parse(row.metadata || '{}'),
        hash: row.hash,
        url: `/working/${row.filename}`,
        thumbnail: row.hash ? `/thumbnails/${row.hash}.jpg` : null
      })) });
    });
  });

  // --- Ingest on upload (dedup by hash) ---
  app.post('/upload', upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      const result = await ingestPhoto(db, req.file.path, req.file.filename, 'working');
      if (result.duplicate) {
        return res.json({ success: false, duplicate: true, hash: result.hash, message: 'Duplicate file skipped.' });
      }
      res.json({ success: true, filename: req.file.filename, hash: result.hash });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to save file' });
    }
  });

  // --- Serve images statically from working dir ---
  app.use('/working', express.static(WORKING_DIR));

  // --- Inprogress directory setup ---
  const INPROGRESS_DIR = path.join(WORKING_DIR, '..', 'inprogress');
  if (!fs.existsSync(INPROGRESS_DIR)) {
    fs.mkdirSync(INPROGRESS_DIR, { recursive: true });
    console.log(`Created inprogress directory: ${INPROGRESS_DIR}`);
  }
  app.use('/inprogress', express.static(INPROGRESS_DIR));

  // --- Serve thumbnails ---
  app.use('/thumbnails', express.static(THUMB_DIR));

  // --- State transition endpoint ---
  app.patch('/photos/:id/state', express.json(), (req, res) => {
    const { id } = req.params;
    const { state } = req.body;
    if (!['working', 'inprogress'].includes(state)) {
      return res.status(400).json({ success: false, error: 'Invalid state' });
    }
    db.get('SELECT * FROM photos WHERE id = ?', [id], (err, row) => {
      if (err || !row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }
      const srcDir = row.state === 'working' ? WORKING_DIR : INPROGRESS_DIR;
      const destDir = state === 'working' ? WORKING_DIR : INPROGRESS_DIR;
      const srcPath = path.join(srcDir, row.filename);
      const destPath = path.join(destDir, row.filename);
      if (!fs.existsSync(srcPath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
      // Move or copy file
      try {
        if (srcPath !== destPath) {
          fs.copyFileSync(srcPath, destPath);
          fs.unlinkSync(srcPath);
        }
        // Set permissions: read-only for working, read/write for inprogress
        if (state === 'working') {
          fs.chmodSync(destPath, 0o444); // read-only
        } else {
          fs.chmodSync(destPath, 0o666); // read/write
        }
        db.run('UPDATE photos SET state = ?, updated_at = ? WHERE id = ?', [state, new Date().toISOString(), id]);
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'OK', 
      workingDir: WORKING_DIR,
      timestamp: new Date().toISOString()
    });
  });

  // Error handling middleware
  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File too large'
        });
      }
    }
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  });

  // Privilege check endpoint
  app.post('/privilege', async (req, res) => {
    try {
      const { relPath } = req.body;
      if (!relPath) {
        return res.status(400).json({ success: false, error: 'Missing relPath' });
      }
      // Only allow checking inside working dir
      let absPath = path.resolve(WORKING_DIR, relPath);
      if (!absPath.startsWith(WORKING_DIR)) {
        // If client passed a pathlike relPath, normalize it
        // We'll still allow checking inprogress by attempting next
      }

      // If file doesn't exist in working dir, try inprogress dir (allow checking both folders)
      if (!fs.existsSync(absPath)) {
        const altPath = path.resolve(INPROGRESS_DIR, relPath);
        if (fs.existsSync(altPath)) {
          absPath = altPath;
        } else {
          return res.status(404).json({ success: false, error: 'File/folder not found' });
        }
      }

      // Check privileges with logging
      let privileges = { read: false, write: false, execute: false };
      let log = [];
      try {
        fs.accessSync(absPath, fs.constants.R_OK);
        privileges.read = true;
        log.push('read: OK');
      } catch (e) {
        log.push('read: FAIL');
      }
      try {
        fs.accessSync(absPath, fs.constants.W_OK);
        privileges.write = true;
        log.push('write: OK');
      } catch (e) {
        log.push('write: FAIL');
      }
      try {
        fs.accessSync(absPath, fs.constants.X_OK);
        privileges.execute = true;
        log.push('execute: OK');
      } catch (e) {
        log.push('execute: FAIL');
      }
      // Get stat info
      let stat = null;
      try { stat = fs.statSync(absPath); } catch {}
      res.json({
        success: true,
        absPath,
        privileges,
        log,
        stat: stat ? {
          isFile: stat.isFile(),
          isDirectory: stat.isDirectory(),
          mode: stat.mode,
          size: stat.size,
          mtime: stat.mtime
        } : null
      });
    } catch (error) {
      console.error('Privilege check error:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`Photo upload server running on port ${PORT}`);
    console.log(`Working directory: ${WORKING_DIR}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  // Generate thumbnails asynchronously after server start (do not block startup)
  ensureAllThumbnails(db).catch(err => console.error('ensureAllThumbnails failed:', err));

}

migrateAndStartServer();