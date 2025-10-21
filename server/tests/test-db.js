const knex = require('knex');
const knexConfig = require('../knexfile');

// Create a test database instance
function createTestDb() {
  const db = knex(knexConfig.test);
  return db;
}

// Setup test database with migrations
async function setupTestDb() {
  const db = createTestDb();
  await db.migrate.latest();
  return db;
}

// Cleanup test database
async function cleanupTestDb(db) {
  if (db) {
    await db.destroy();
  }
}

module.exports = {
  createTestDb,
  setupTestDb,
  cleanupTestDb
};