const { openDb, migrate } = require('../db/index');
const fs = require('fs');
const path = require('path');

describe('Database Operations', () => {
  let db;
  const testDbPath = path.join(__dirname, 'test.db');

  beforeEach(async () => {
    // Clean up any existing test db
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    db = openDb(testDbPath);
    await migrate(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create photos table with correct schema', async () => {
    return new Promise((resolve) => {
      db.all("PRAGMA table_info(photos)", (err, columns) => {
        expect(err).toBeNull();
        const colNames = columns.map(col => col.name);
        expect(colNames).toContain('id');
        expect(colNames).toContain('filename');
        expect(colNames).toContain('state');
        expect(colNames).toContain('metadata');
        expect(colNames).toContain('hash');
        expect(colNames).toContain('caption');
        expect(colNames).toContain('file_size');
        resolve();
      });
    });
  });

  it('should insert and retrieve a photo', async () => {
    return new Promise((resolve) => {
      const photoData = {
        filename: 'test.jpg',
        state: 'working',
        metadata: JSON.stringify({ width: 100, height: 100 }),
        hash: 'abc123',
        file_size: 1024,
      };

      db.run(
        `INSERT INTO photos (filename, state, metadata, hash, file_size, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [photoData.filename, photoData.state, photoData.metadata, photoData.hash, photoData.file_size],
        function(err) {
          expect(err).toBeNull();
          const id = this.lastID;

          db.get('SELECT * FROM photos WHERE id = ?', [id], (err, row) => {
            expect(err).toBeNull();
            expect(row.filename).toBe(photoData.filename);
            expect(row.state).toBe(photoData.state);
            expect(JSON.parse(row.metadata)).toEqual({ width: 100, height: 100 });
            expect(row.hash).toBe(photoData.hash);
            expect(row.file_size).toBe(1024);
            resolve();
          });
        }
      );
    });
  });

  it('should prevent duplicate filenames', async () => {
    return new Promise((resolve) => {
      const photoData = {
        filename: 'duplicate.jpg',
        state: 'working',
        metadata: '{}',
        hash: 'hash1',
        file_size: 512,
      };

      db.run(
        `INSERT INTO photos (filename, state, metadata, hash, file_size, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [photoData.filename, photoData.state, photoData.metadata, photoData.hash, photoData.file_size],
        (err) => {
          expect(err).toBeNull();

          // Try to insert duplicate filename
          db.run(
            `INSERT INTO photos (filename, state, metadata, hash, file_size, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [photoData.filename, 'inprogress', '{}', 'hash2', 1024],
            (err) => {
              expect(err).toBeDefined(); // Should fail due to UNIQUE constraint
              resolve();
            }
          );
        }
      );
    });
  });

  it('should update photo state and caption', async () => {
    return new Promise((resolve) => {
      const photoData = {
        filename: 'update.jpg',
        state: 'working',
        metadata: '{}',
        hash: 'update123',
        file_size: 2048,
      };

      db.run(
        `INSERT INTO photos (filename, state, metadata, hash, file_size, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [photoData.filename, photoData.state, photoData.metadata, photoData.hash, photoData.file_size],
        function(err) {
          expect(err).toBeNull();
          const id = this.lastID;

          db.run(
            'UPDATE photos SET state = ?, caption = ?, updated_at = datetime(\'now\') WHERE id = ?',
            ['finished', 'Updated caption', id],
            (err) => {
              expect(err).toBeNull();

              db.get('SELECT state, caption FROM photos WHERE id = ?', [id], (err, row) => {
                expect(err).toBeNull();
                expect(row.state).toBe('finished');
                expect(row.caption).toBe('Updated caption');
                resolve();
              });
            }
          );
        }
      );
    });
  });
});