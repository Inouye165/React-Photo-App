const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

function expandPath(p) {
  if (!p) return p;
  if (p.startsWith('~')) p = path.join(require('os').homedir(), p.slice(1));
  p = p.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
  p = p.replace(/\$\{([^}]+)\}/g, (_, n) => process.env[n] || '');
  return p;
}

const wdFile = path.join(__dirname, 'working_dir_path.txt');
if (!fs.existsSync(wdFile)) {
  console.error('working_dir_path.txt not found');
  process.exit(1);
}
let working = fs.readFileSync(wdFile, 'utf8').trim();
working = expandPath(working);
const baseDir = path.dirname(working);
const inprogress = path.join(baseDir, 'inprogress');
const finished = path.join(baseDir, 'finished');
console.log('Resolved working dir:', working);
console.log('Resolved inprogress dir:', inprogress);
console.log('Resolved finished dir:', finished);

const dbPath = path.join(__dirname, 'photos.db');
if (!fs.existsSync(dbPath)) {
  console.error('photos.db not found at', dbPath);
  process.exit(1);
}
const db = new sqlite3.Database(dbPath);

db.all('SELECT id, filename, state FROM photos ORDER BY id', (err, rows) => {
  if (err) {
    console.error('DB error', err);
    process.exit(1);
  }
  console.log('DB rows:', rows.length);
  for (const r of rows) {
    const dir = r.state === 'working' ? working : (r.state === 'inprogress' ? inprogress : finished);
    const file = path.join(dir, r.filename);
    const exists = fs.existsSync(file);
    console.log(`${r.id}\t${r.filename}\t${r.state}\t${exists ? 'EXISTS' : 'MISSING'}\t${file}`);
  }
  db.close();
});
