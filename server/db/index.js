const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function openDb(dbPath = path.join(__dirname, '..', 'photos.db')) {
  const db = new sqlite3.Database(dbPath);
  return db;
}

async function migrate(db) {
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
}

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
      if (!colNames.includes('text_style')) tasks.push(addCol('text_style', 'TEXT'));
      if (!colNames.includes('edited_filename')) tasks.push(addCol('edited_filename', 'TEXT'));
      if (!colNames.includes('ai_retry_count')) tasks.push(addCol('ai_retry_count', 'INTEGER DEFAULT 0'));
      if (!colNames.includes('file_size')) tasks.push(addCol('file_size', 'INTEGER'));
      Promise.all(tasks).then(resolve).catch(reject);
    });
  });
}

module.exports = { openDb, migrate };