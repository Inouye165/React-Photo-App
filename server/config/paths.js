const path = require('path');
const fs = require('fs');
const os = require('os');

const DEFAULT_WORKING_DIR = path.join(os.homedir(), 'working');
const WORKING_DIR_PATH_FILE = path.join(__dirname, '..', 'working_dir_path.txt');

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

const THUMB_DIR = path.join(WORKING_DIR, '.thumbnails');
if (!fs.existsSync(THUMB_DIR)) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
}

module.exports = {
  DEFAULT_WORKING_DIR,
  WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR, THUMB_DIR,
  expandPath, detectOneDriveWorking
};