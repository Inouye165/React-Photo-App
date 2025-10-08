const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const exifr = require('exifr');
const sharp = require('sharp');
const { exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.PORT || 3001;
const DEFAULT_WORKING_DIR = path.join(os.homedir(), 'working');
const WORKING_DIR_PATH_FILE = path.join(__dirname, 'working_dir_path.txt');

function getNonEmptyDir(dir) {
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

// Expand environment variables and ~ in a path string
function expandPath(p) {
  if (!p) return p;
  // Replace ~ with homedir
  if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1));
  // Expand %ENV% on Windows
  p = p.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
  // Expand ${ENV} style
  p = p.replace(/\$\{([^}]+)\}/g, (_, n) => process.env[n] || '');
  return p;
}

// Try to detect a OneDrive Pictures working folder for the current or other users
function detectOneDriveWorking() {
  const candidates = [];
  // Common current-user OneDrive Pictures path
  candidates.push(path.join(os.homedir(), 'OneDrive', 'Pictures', 'yellowstone 2025', 'working'));
  // Also check generic Pictures\working
  candidates.push(path.join(os.homedir(), 'OneDrive', 'Pictures', 'working'));
  // Check OneDrive - Personal variant (some locales)
  candidates.push(path.join(os.homedir(), 'OneDrive - Personal', 'Pictures', 'yellowstone 2025', 'working'));

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  }
  return null;
}

function findOrCreateWorkingDir() {
  // 1. If path file exists, use it (but expand env vars)
  if (fs.existsSync(WORKING_DIR_PATH_FILE)) {
    let saved = fs.readFileSync(WORKING_DIR_PATH_FILE, 'utf-8').trim();
    saved = expandPath(saved);
    if (saved && fs.existsSync(saved)) return saved;
  }
  // 2. If env override, use it (and persist)
  if (process.env.PHOTO_WORKING_DIR) {
    const p = expandPath(process.env.PHOTO_WORKING_DIR);
    fs.writeFileSync(WORKING_DIR_PATH_FILE, p);
    return p;
  }

  // 3. Prefer OneDrive Pictures working folder if present
  const oneDrive = detectOneDriveWorking();
  if (oneDrive) {
    fs.writeFileSync(WORKING_DIR_PATH_FILE, oneDrive);
    return oneDrive;
  }

  // 4. If default does not exist, create it and persist
  if (!fs.existsSync(DEFAULT_WORKING_DIR)) fs.mkdirSync(DEFAULT_WORKING_DIR, { recursive: true });
  fs.writeFileSync(WORKING_DIR_PATH_FILE, DEFAULT_WORKING_DIR);
  return DEFAULT_WORKING_DIR;
}

const WORKING_DIR = findOrCreateWorkingDir();

if (!fs.existsSync(WORKING_DIR)) {
  fs.mkdirSync(WORKING_DIR, { recursive: true });
  console.log(`Created working directory: ${WORKING_DIR}`);
}

// --- Inprogress directory setup (moved up for early availability) ---
const INPROGRESS_DIR = path.join(WORKING_DIR, '..', 'inprogress');
if (!fs.existsSync(INPROGRESS_DIR)) {
  fs.mkdirSync(INPROGRESS_DIR, { recursive: true });
  console.log(`Created inprogress directory: ${INPROGRESS_DIR}`);
}

const FINISHED_DIR = path.join(WORKING_DIR, '..', 'finished');
if (!fs.existsSync(FINISHED_DIR)) {
  fs.mkdirSync(FINISHED_DIR, { recursive: true });
  console.log(`Created finished directory: ${FINISHED_DIR}`);
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

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

// Update ensureAllFilesHashed to enforce only images in working dir
async function ensureAllFilesHashed(db) {
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
  if (ignored.length > 0) {
    console.log('[WORKING DIR] Ignored non-image files:', ignored.join(', '));
    console.log('[WORKING DIR] To avoid these messages, remove or hide non-image files (e.g., desktop.ini, thumbs.db) from the working directory.');
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
    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;
    const now = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO photos (filename, state, metadata, hash, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [filename, state, metaStr, hash, fileSize, now, now]
    );
    await generateThumbnail(filePath, hash);
    return { duplicate: false, hash };
  } catch (err) {
    console.error('Metadata/hash extraction failed for', filename, err);
    return { duplicate: false, hash: null };
  }
}

// Migration: ensure 'caption', 'description', 'keywords' columns exist
async function migratePhotoTable(db) {
  await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(photos)", (err, columns) => {
      if (err) return reject(err);
      const colNames = columns.map(col => col.name);
      const addCol = (name, type) =>
        new Promise(res => db.run(`ALTER TABLE photos ADD COLUMN ${name} ${type}`, () => res()));
      const tasks = [];
      if (!colNames.includes('caption')) tasks.push(addCol('caption', 'TEXT'));
      if (!colNames.includes('description')) tasks.push(addCol('description', 'TEXT'));
      if (!colNames.includes('keywords')) tasks.push(addCol('keywords', 'TEXT'));
      if (!colNames.includes('ai_retry_count')) tasks.push(addCol('ai_retry_count', 'INTEGER DEFAULT 0'));
      if (!colNames.includes('file_size')) tasks.push(addCol('file_size', 'INTEGER'));
      Promise.all(tasks).then(resolve).catch(reject);
    });
  });
}

// Backfill file sizes for existing records that don't have them
async function backfillFileSizes(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, filename, state FROM photos WHERE file_size IS NULL OR file_size = 0', async (err, rows) => {
      if (err) return reject(err);
      if (rows.length === 0) {
        console.log('[BACKFILL] No files need file size backfill.');
        return resolve(rows.length);
      }
      console.log(`[BACKFILL] Backfilling file sizes for ${rows.length} records...`);
      let updated = 0;
      for (const row of rows) {
        try {
          const getDir = (state) => {
            switch(state) {
              case 'working': return WORKING_DIR;
              case 'inprogress': return INPROGRESS_DIR;
              case 'finished': return FINISHED_DIR;
              default: return WORKING_DIR;
            }
          };
          const dir = getDir(row.state);
          const filePath = path.join(dir, row.filename);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            db.run('UPDATE photos SET file_size = ? WHERE id = ?', [stats.size, row.id]);
            updated++;
          } else {
            console.log(`[BACKFILL] File not found for backfill: ${filePath}`);
          }
        } catch (error) {
          console.error(`[BACKFILL] Error getting file size for ${row.filename}:`, error.message);
        }
      }
      console.log(`[BACKFILL] Updated file sizes for ${updated} records.`);
      resolve(updated);
    });
  });
}

// Backfill file sizes for existing records that don't have them
async function backfillFileSizes(db) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, filename, state FROM photos WHERE file_size IS NULL', async (err, rows) => {
      if (err) return reject(err);
      let updated = 0;
      for (const row of rows) {
        const fileDir = row.state === 'working' ? WORKING_DIR : INPROGRESS_DIR;
        const filePath = path.join(fileDir, row.filename);
        if (fs.existsSync(filePath)) {
          try {
            const fileStats = fs.statSync(filePath);
            db.run('UPDATE photos SET file_size = ? WHERE id = ?', [fileStats.size, row.id]);
            updated++;
          } catch (err) {
            console.error(`Failed to get file size for ${row.filename}:`, err);
          }
        }
      }
      if (updated > 0) console.log(`[MIGRATION] Updated file sizes for ${updated} records.`);
      resolve();
    });
  });
}

// Remove DB records for missing files in working dir
async function cleanupMissingFiles(db, workingDir) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, filename FROM photos WHERE state = "working"', async (err, rows) => {
      if (err) return reject(err);
      let removed = 0;
      for (const row of rows) {
        const filePath = path.join(workingDir, row.filename);
        if (!fs.existsSync(filePath)) {
          db.run('DELETE FROM photos WHERE id = ?', [row.id]);
          removed++;
        }
      }
      if (removed > 0) console.log(`[CLEANUP] Removed ${removed} DB records for missing files in working dir.`);
      resolve();
    });
  });
}

// Remove DB records for missing files in inprogress dir
async function cleanupMissingInprogressFiles(db, inprogressDir) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, filename FROM photos WHERE state = "inprogress"', async (err, rows) => {
      if (err) return reject(err);
      let removed = 0;
      for (const row of rows) {
        const filePath = path.join(inprogressDir, row.filename);
        if (!fs.existsSync(filePath)) {
          db.run('DELETE FROM photos WHERE id = ?', [row.id]);
          removed++;
        }
      }
      if (removed > 0) console.log(`[CLEANUP] Removed ${removed} DB records for missing files in inprogress dir.`);
      resolve();
    });
  });
}

async function migrateAndStartServer() {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(path.join(__dirname, 'photos.db'));
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
  // Migration: ensure 'caption', 'description', 'keywords' columns exist
  await migratePhotoTable(db);
  // Backfill file sizes for existing records
  await backfillFileSizes(db);
  // Ensure all files are hashed
  await ensureAllFilesHashed(db);
  // Cleanup DB records for missing files
  await cleanupMissingFiles(db, WORKING_DIR);
  await cleanupMissingInprogressFiles(db, INPROGRESS_DIR);
  await processAllUnprocessedInprogress(db);

  // --- Express app and routes ---
  const express = require('express');
  const multer = require('multer');
  const cors = require('cors');
  const app = express();

  // Allow cross-origin requests from local dev servers (keep permissive for development)
  app.use(cors());
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
    const state = req.query.state;
    let sql = 'SELECT id, filename, state, metadata, hash, file_size, caption, description, keywords FROM photos';
    const params = [];
    if (state === 'working' || state === 'inprogress' || state === 'finished') {
      sql += ' WHERE state = ?';
      params.push(state);
    }
    console.log('SQL:', sql, 'params:', params);
    db.all(sql, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      // Helper function to get directory based on state
      const getDir = (state) => {
        switch(state) {
          case 'working': return WORKING_DIR;
          case 'inprogress': return INPROGRESS_DIR;
          case 'finished': return FINISHED_DIR;
          default: return WORKING_DIR;
        }
      };

      // Filter out photos whose files no longer exist and clean up DB
      const filteredRows = [];
      for (const row of rows) {
        const dir = getDir(row.state);
        const filePath = path.join(dir, row.filename);
        if (fs.existsSync(filePath)) {
          filteredRows.push(row);
        } else {
          // Remove from DB since file is missing
          db.run('DELETE FROM photos WHERE id = ?', [row.id], (deleteErr) => {
            if (deleteErr) console.error('Error deleting missing photo from DB:', deleteErr);
          });
        }
      }

      // Prevent caching so frontend always gets fresh filtered results
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, photos: filteredRows.map(row => ({
        id: row.id,
        filename: row.filename,
        state: row.state,
        metadata: JSON.parse(row.metadata || '{}'),
        hash: row.hash,
        file_size: row.file_size,
        caption: row.caption,
        description: row.description,
        keywords: row.keywords,
        url: `/${row.state}/${row.filename}`,
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
  app.use('/inprogress', express.static(INPROGRESS_DIR));

  // --- Finished directory setup ---
  app.use('/finished', express.static(FINISHED_DIR));

  // --- Serve thumbnails (generate on demand if missing) ---
  app.get('/thumbnails/:name', async (req, res) => {
    try {
      const name = req.params.name;
      const thumbPath = path.join(THUMB_DIR, name);
      if (fs.existsSync(thumbPath)) return res.sendFile(thumbPath);
      // Try to derive hash from name (expecting <hash>.jpg)
      const hash = path.basename(name, path.extname(name));
      // Attempt to find original file by matching hash in DB
      db.get('SELECT filename, state FROM photos WHERE hash = ?', [hash], async (err, row) => {
        if (err || !row) return res.status(404).send('Thumbnail not found');
        const getDir = (state) => {
          switch(state) {
            case 'working': return WORKING_DIR;
            case 'inprogress': return INPROGRESS_DIR;
            case 'finished': return FINISHED_DIR;
            default: return WORKING_DIR;
          }
        };
        const origPath = path.join(getDir(row.state), row.filename);
        if (!fs.existsSync(origPath)) return res.status(404).send('Original file missing');
        try {
          const gen = await generateThumbnail(origPath, hash);
          if (gen && fs.existsSync(gen)) return res.sendFile(gen);
          return res.status(500).send('Thumbnail generation failed');
        } catch (genErr) {
          console.error('Thumbnail generation on-demand failed for', origPath, genErr);
          return res.status(500).send('Thumbnail generation failed');
        }
      });
    } catch (e) {
      console.error('Thumbnail route error', e);
      res.status(500).send('Server error');
    }
  });

  // --- Convert and serve images for display (HEIC -> JPEG) ---
  app.get('/display/:state/:filename', async (req, res) => {
    const { state, filename } = req.params;
    
    // Get directory based on state
    const getDir = (state) => {
      switch(state) {
        case 'working': return WORKING_DIR;
        case 'inprogress': return INPROGRESS_DIR;
        case 'finished': return FINISHED_DIR;
        default: return WORKING_DIR;
      }
    };
    
    const dir = getDir(state);
  const filePath = path.join(dir, filename);
  console.log('[PHOTO SERVE] Full file path:', filePath);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    
    const ext = path.extname(filename).toLowerCase();
    
    // If it's already JPG/PNG/etc, serve directly
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      return res.sendFile(filePath);
    }
    
    // Convert HEIC/HEIF to JPEG for browser display
    if (['.heic', '.heif'].includes(ext)) {
      try {
        // Try sharp first
        const jpegBuffer = await sharp(filePath).jpeg({ quality: 90 }).toBuffer();
        res.set('Content-Type', 'image/jpeg');
        return res.send(jpegBuffer);
      } catch (err) {
        console.error('[DISPLAY] Sharp conversion failed for', filePath, err);
        // Fallback to ImageMagick
        const tmpJpg = filePath + '.tmp-display.jpg';
        const cmd = `magick "${filePath}" -strip -quality 90 "${tmpJpg}"`;
        try {
          await new Promise((resolve, reject) => {
            exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
              if (error) return reject(new Error(stderr || stdout || error.message));
              resolve();
            });
          });
          res.sendFile(tmpJpg, (err) => {
            // Clean up temp file after sending
            try { fs.unlinkSync(tmpJpg); } catch (e) {}
            if (err) console.error('[DISPLAY] Error sending converted file:', err);
          });
        } catch (convErr) {
          console.error('[DISPLAY] ImageMagick conversion failed for', filePath, convErr);
          return res.status(500).send('Unable to convert image for display');
        }
      }
    } else {
      // Unsupported format
      return res.status(415).send('Unsupported image format');
    }
  });

  // --- State transition endpoint ---
  app.patch('/photos/:id/state', express.json(), (req, res) => {
    const { id } = req.params;
    const { state } = req.body;
    if (!['working', 'inprogress', 'finished'].includes(state)) {
      return res.status(400).json({ success: false, error: 'Invalid state' });
    }
    db.get('SELECT * FROM photos WHERE id = ?', [id], (err, row) => {
      if (err || !row) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }
      
      // Helper function to get directory based on state
      const getDir = (state) => {
        switch(state) {
          case 'working': return WORKING_DIR;
          case 'inprogress': return INPROGRESS_DIR;
          case 'finished': return FINISHED_DIR;
          default: return WORKING_DIR;
        }
      };
      
      const srcDir = getDir(row.state);
      const destDir = getDir(state);
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
        if (state === 'inprogress') {
          // Run AI pipeline after state change
          updatePhotoAIMetadata(db, row, destPath).then(ai => {
            if (ai) console.log('AI metadata updated for', row.filename);
          });
        }
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
  });

  // --- Caption update endpoint ---
  app.patch('/photos/:id/caption', express.json(), (req, res) => {
    const { id } = req.params;
    const { caption } = req.body;
    if (typeof caption !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid caption' });
    }
    db.get('SELECT id FROM photos WHERE id = ?', [id], (err, row) => {
      if (err || !row) return res.status(404).json({ success: false, error: 'Photo not found' });
      db.run('UPDATE photos SET caption = ?, updated_at = ? WHERE id = ?', [caption, new Date().toISOString(), id], function(updateErr) {
        if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
        res.json({ success: true });
      });
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
      console.log('Incoming /privilege request from', req.ip, 'body=', req.body);
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

  // Add endpoint to recheck/reprocess all inprogress files for AI metadata
  app.post('/photos/recheck-inprogress', (req, res) => {
    try {
      console.log('[RECHECK] /photos/recheck-inprogress endpoint called');
      processAllUnprocessedInprogress(db);
      res.json({ success: true });
    } catch (err) {
      console.error('[RECHECK] Failed to trigger recheck for inprogress files:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Debug endpoint to list all inprogress files in the database
  app.get('/debug/inprogress', (req, res) => {
    db.all('SELECT * FROM photos WHERE state = ?', ['inprogress'], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // Debug endpoint to reset ai_retry_count for all HEIC files
  app.post('/debug/reset-ai-retry', (req, res) => {
    db.run("UPDATE photos SET ai_retry_count = 0 WHERE filename LIKE '%.HEIC'", function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
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

// Helper: Generate caption, description, keywords for a photo using OpenAI Vision
async function processPhotoAI({ filePath, metadata, gps, device }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in .env');
  
  // Extract and format date/time from EXIF
  let dateTimeInfo = '';
  if (metadata) {
    const dateOriginal = metadata.DateTimeOriginal || metadata.CreateDate || metadata.DateTime;
    if (dateOriginal) {
      try {
        const date = new Date(dateOriginal);
        const options = { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        };
        dateTimeInfo = date.toLocaleDateString('en-US', options);
      } catch (e) {
        dateTimeInfo = dateOriginal; // fallback to raw date if parsing fails
      }
    }
  }
  
  // Compose prompt with new requirements
  let prompt = `You are an expert photo analyst. Given the image and metadata, generate:\n- A short, human-friendly caption (max 10 words)\n- A detailed description that MUST include the date and time naturally in the text (covering people, animals, plants, weather, lighting, time of day, selfie detection, and location-based names for rivers, waterfalls, geysers, pools, cliffs, mountains, etc.)\n- A comma-separated list of keywords (for search) that MUST include GPS coordinates and camera device information if available\n\nMetadata:`;
  
  if (dateTimeInfo) prompt += ` Date/Time: ${dateTimeInfo}.`;
  if (metadata) prompt += ` EXIF: ${JSON.stringify(metadata)}.`;
  
  prompt += `\n\nIMPORTANT INSTRUCTIONS:
1. DESCRIPTION: Must naturally incorporate the date and time information (e.g., "This sunny afternoon photo taken on Tuesday, March 15th, 2024 at 2:30 PM shows...")
2. KEYWORDS: Must include GPS coordinates (if available) and camera device information (e.g., "iPhone 15 Pro, GPS:37.7749,-122.4194, sunset, beach")
3. Do NOT put GPS or device info in the description - only in keywords

Respond in JSON with keys: caption, description, keywords.`;
  
  // Add GPS and device to context for keywords
  if (device) prompt += `\nDevice Info: ${device}`;
  if (gps) prompt += `\nGPS Info: ${gps}`;

  // Convert HEIC/HEIF to JPEG if needed
  let imageBuffer, imageMime;
  const ext = path.extname(filePath).toLowerCase();
  console.log('[AI DEBUG] processPhotoAI called for', filePath, 'ext:', ext);
  if (ext === '.heic' || ext === '.heif') {
    try {
      console.log('[AI DEBUG] Attempting HEIC->JPEG conversion for', filePath);
      imageBuffer = await sharp(filePath).jpeg().toBuffer();
      imageMime = 'image/jpeg';
      console.log('[AI DEBUG] HEIC->JPEG conversion successful for', filePath, 'buffer size:', imageBuffer.length);
    } catch (err) {
      console.error('[AI DEBUG] Failed to convert HEIC/HEIF to JPEG for', filePath, err);
      // Fallback: use ImageMagick to convert to temp JPEG
      const tmpJpg = filePath + '.tmp-ai.jpg';
      const cmd = `magick "${filePath}" -strip -quality 90 "${tmpJpg}"`;
      try {
        console.log('[AI DEBUG] Attempting ImageMagick HEIC->JPEG conversion for', filePath);
        await new Promise((resolve, reject) => {
          exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) return reject(new Error(stderr || stdout || error.message));
            resolve();
          });
        });
        imageBuffer = fs.readFileSync(tmpJpg);
        imageMime = 'image/jpeg';
        console.log('[AI DEBUG] ImageMagick HEIC->JPEG conversion successful for', filePath, 'buffer size:', imageBuffer.length);
        try { fs.unlinkSync(tmpJpg); } catch (e) {}
      } catch (convErr) {
        console.error('[AI DEBUG] ImageMagick fallback conversion failed for', filePath, convErr);
        try { if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg); } catch (e) {}
        throw convErr;
      }
    }
  } else {
    try {
      imageBuffer = fs.readFileSync(filePath);
      imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
      console.log('[AI DEBUG] Read image buffer for', filePath, 'size:', imageBuffer.length, 'mime:', imageMime);
    } catch (err) {
      console.error('[AI DEBUG] Failed to read image buffer for', filePath, err);
      throw err;
    }
  }
  const imageBase64 = imageBuffer.toString('base64');
  const imageDataUri = `data:${imageMime};base64,${imageBase64}`;
  console.log('[AI DEBUG] Created imageDataUri for', filePath, 'length:', imageDataUri.length);

  const messages = [
    { role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageDataUri } }
    ]}
  ];
  let response;
  try {
    console.log('[AI DEBUG] Sending image to OpenAI Vision API for', filePath);
    response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 1024,
      temperature: 0.3
    });
    console.log('[AI DEBUG] OpenAI Vision API response received for', filePath);
  } catch (err) {
    console.error('[AI DEBUG] OpenAI Vision API error for', filePath, err);
    throw err;
  }
  // Try to parse JSON from response
  let result = { caption: '', description: '', keywords: '' };
  try {
    const content = response.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    if (match) result = JSON.parse(match[0]);
    else result.description = content;
    console.log('[AI DEBUG] Parsed AI result for', filePath, result);
  } catch (e) {
    result.description = response.choices[0].message.content;
    console.error('[AI DEBUG] Failed to parse AI JSON for', filePath, e);
  }
  return result;
}

// Helper: Update photo AI metadata in DB with retry logic
async function updatePhotoAIMetadata(db, photoRow, filePath) {
  try {
    const meta = JSON.parse(photoRow.metadata || '{}');
    const gps = meta.GPSLatitude && meta.GPSLongitude ? `${meta.GPSLatitude},${meta.GPSLongitude}` : '';
    const device = meta.Make && meta.Model ? `${meta.Make} ${meta.Model}` : '';
    const retryCount = photoRow.ai_retry_count || 0;
    console.log(`[RECHECK] updatePhotoAIMetadata called for ${photoRow.filename}, retryCount=${retryCount}`);
    if (retryCount >= 5) {
      db.run('UPDATE photos SET caption = ?, description = ?, keywords = ?, ai_retry_count = ? WHERE id = ?',
        ['AI processing failed', 'AI processing failed', '', retryCount, photoRow.id]);
      console.log(`[RECHECK] Skipping AI processing for ${photoRow.filename}, retryCount >= 5`);
      return null;
    }
    let ai;
    try {
      console.log(`[RECHECK] Calling processPhotoAI for ${filePath}, retryCount: ${retryCount}`);
      ai = await processPhotoAI({ filePath, metadata: meta, gps, device });
    } catch (err) {
      db.run('UPDATE photos SET ai_retry_count = ? WHERE id = ?', [retryCount + 1, photoRow.id]);
      console.error(`[RECHECK] AI processing failed (retry ${retryCount + 1}) for ${photoRow.filename}:`, err);
      return null;
    }
    db.run('UPDATE photos SET caption = ?, description = ?, keywords = ?, ai_retry_count = ? WHERE id = ?',
      [ai.caption, ai.description, ai.keywords, 0, photoRow.id]);
    console.log(`[RECHECK] AI metadata updated for ${photoRow.filename}`, ai);
    return ai;
  } catch (err) {
    console.error(`[RECHECK] AI processing failed for ${photoRow.filename}:`, err);
    return null;
  }
}

function isAIFailed(val) {
  return !val || val.trim().toLowerCase() === 'ai processing failed';
}

// On server start, process all inprogress photos missing AI metadata or with retry count < 2
async function processAllUnprocessedInprogress(db) {
  db.all('SELECT * FROM photos WHERE state = ? AND (caption IS NULL OR description IS NULL OR keywords IS NULL OR ai_retry_count < 2)', ['inprogress'], async (err, rows) => {
    if (err) return console.error('[RECHECK] DB error during AI check:', err);
    console.log(`[RECHECK] Found ${rows.length} inprogress files needing AI processing`);
    for (const row of rows) {
      if (
        !isAIFailed(row.caption) &&
        !isAIFailed(row.description) &&
        !isAIFailed(row.keywords) &&
        (!row.ai_retry_count || row.ai_retry_count < 2)
      ) {
        console.log(`[RECHECK] Skipping ${row.filename} (already has valid AI metadata)`);
        continue;
      }
      const filePath = path.join(INPROGRESS_DIR, row.filename);
      if (fs.existsSync(filePath)) {
        console.log(`[RECHECK] Processing AI metadata for ${row.filename}`);
        await updatePhotoAIMetadata(db, row, filePath);
      } else {
        console.log(`[RECHECK] File not found for ${row.filename} at ${filePath}`);
      }
    }
  });
}

migrateAndStartServer();