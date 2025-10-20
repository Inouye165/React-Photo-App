const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function openDb(dbPath = path.join(__dirname, '..', 'photos.db')) {
  const db = new sqlite3.Database(dbPath);
  return db;
}

async function migrate(db) {
  // Ensure photos table exists
  await new Promise((resolve, _reject) => {
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
  
  // Ensure users table exists with proper security constraints
  await new Promise((resolve, _reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      last_login_attempt TEXT,
      account_locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`, resolve);
  });
  
  // Create indexes for users table
  await new Promise((resolve, _reject) => {
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)', () => {
      db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)', () => {
        db.run('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)', resolve);
      });
    });
  });
  
  // Migration: ensure 'hash' column exists
  await new Promise((resolve, _reject) => {
    db.all("PRAGMA table_info(photos)", (err, columns) => {
      if (err) return _reject(err);
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
  await new Promise((resolve, _reject) => {
    db.all("PRAGMA table_info(photos)", (err, columns) => {
      if (err) return _reject(err);
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
      if (!colNames.includes('poi_analysis')) tasks.push(addCol('poi_analysis', 'TEXT'));
      Promise.all(tasks).then(resolve).catch(_reject);
    });
  });
}

module.exports = { openDb, migrate };