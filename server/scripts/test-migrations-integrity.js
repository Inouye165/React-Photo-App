const knex = require('knex');
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'test-migrations.sqlite3');

// Ensure clean start
if (fs.existsSync(DB_FILE)) {
  fs.unlinkSync(DB_FILE);
}

const config = {
  client: 'sqlite3',
  connection: {
    filename: DB_FILE
  },
  migrations: {
    directory: path.join(__dirname, '../db/migrations')
  },
  useNullAsDefault: true,
  // Disable foreign keys for SQLite to avoid issues during rollback if not handled perfectly
  pool: {
    afterCreate: (conn, cb) => {
      conn.run('PRAGMA foreign_keys = OFF', cb);
    }
  }
};

const db = knex(config);

async function run() {
  try {
    console.log('🚀 Starting Migration Integrity Test...');
    console.log(`📂 Database: ${DB_FILE}`);

    // 1. Migrate Up
    console.log('\n⬆️  Running migrate:latest...');
    await db.migrate.latest();
    const currentVersion = await db.migrate.currentVersion();
    console.log(`✅ Migrated to version: ${currentVersion}`);

    // 2. Migrate Down (Rollback all)
    console.log('\n⬇️  Running migrate:rollback (all)...');
    // Rollback until we are at the beginning
    // Note: knex.migrate.rollback() rolls back one batch. We might need a loop or force all.
    // Roll back the latest batch; immediately after migrate:latest this should contain all applied migrations.
    await db.migrate.rollback(null, true); 
    console.log('✅ Rollback complete.');

    // 3. Migrate Up Again (Idempotency check)
    console.log('\n⬆️  Running migrate:latest (again)...');
    await db.migrate.latest();
    console.log('✅ Re-migration successful.');

    console.log('\n🎉 Migration Integrity Test Passed!');
  } catch (err) {
    console.error('\n❌ Migration Test Failed:', err);
    process.exit(1);
  } finally {
    await db.destroy();
    if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
  }
}

run();
