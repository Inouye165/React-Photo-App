const knex = require('knex');
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
    
    // Create test database instance
    db = knex({
      client: 'sqlite3',
      connection: {
        filename: testDbPath
      },
      useNullAsDefault: true,
      migrations: {
        directory: path.join(__dirname, '..', 'db', 'migrations')
      }
    });
    
    // Run migrations
    await db.migrate.latest();
  });

  afterEach(async () => {
    if (db) {
      await db.destroy();
    }
    // Clean up test db file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create photos table with correct schema', async () => {
    const hasTable = await db.schema.hasTable('photos');
    expect(hasTable).toBe(true);
    
    const columns = await db.raw("PRAGMA table_info(photos)");
    const colNames = columns.map(col => col.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('filename');
    expect(colNames).toContain('state');
    expect(colNames).toContain('metadata');
    expect(colNames).toContain('hash');
    expect(colNames).toContain('caption');
    expect(colNames).toContain('file_size');
  });

  it('should insert and retrieve a photo', async () => {
    const photoData = {
      filename: 'test.jpg',
      state: 'working',
      metadata: JSON.stringify({ width: 100, height: 100 }),
      hash: 'abc123',
      file_size: 1024,
    };

    const [id] = await db('photos').insert({
      ...photoData,
      created_at: new Date(),
      updated_at: new Date()
    });

    const row = await db('photos').where({ id }).first();
    expect(row.filename).toBe(photoData.filename);
    expect(row.state).toBe(photoData.state);
    expect(JSON.parse(row.metadata)).toEqual({ width: 100, height: 100 });
    expect(row.hash).toBe(photoData.hash);
    expect(row.file_size).toBe(1024);
  });

  it('should prevent duplicate filenames', async () => {
    const photoData = {
      filename: 'duplicate.jpg',
      state: 'working',
      metadata: '{}',
      hash: 'hash1',
      file_size: 512,
    };

    await db('photos').insert({
      ...photoData,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Try to insert duplicate filename
    await expect(db('photos').insert({
      filename: photoData.filename,
      state: 'inprogress',
      metadata: '{}',
      hash: 'hash2',
      file_size: 1024,
      created_at: new Date(),
      updated_at: new Date()
    })).rejects.toThrow(); // Should fail due to UNIQUE constraint
  });

  it('should update photo state and caption', async () => {
    const photoData = {
      filename: 'update.jpg',
      state: 'working',
      metadata: '{}',
      hash: 'update123',
      file_size: 2048,
    };

    const [id] = await db('photos').insert({
      ...photoData,
      created_at: new Date(),
      updated_at: new Date()
    });

    await db('photos')
      .where({ id })
      .update({
        state: 'finished',
        caption: 'Updated caption',
        updated_at: new Date()
      });

    const row = await db('photos').where({ id }).select('state', 'caption').first();
    expect(row.state).toBe('finished');
    expect(row.caption).toBe('Updated caption');
  });
});