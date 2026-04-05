const knex = require('knex');
const knexConfig = require('../knexfile');

interface KnexInstance {
  migrate: {
    latest: () => Promise<unknown>;
  };
  destroy: () => Promise<void>;
  (table: string): unknown;
}

// Create a test database instance
function createTestDb(): KnexInstance {
  const db: KnexInstance = knex(knexConfig.test);
  return db;
}

// Setup test database with migrations
async function setupTestDb(): Promise<KnexInstance> {
  const db: KnexInstance = createTestDb();
  await db.migrate.latest();
  return db;
}

// Cleanup test database
async function cleanupTestDb(db: KnexInstance | null): Promise<void> {
  if (db) {
    await db.destroy();
  }
}

module.exports = {
  createTestDb,
  setupTestDb,
  cleanupTestDb
};
