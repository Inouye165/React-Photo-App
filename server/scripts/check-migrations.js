#!/usr/bin/env node
/**
 * server/scripts/check-migrations.js
 *
 * Verifies that every migration listed in the database's knex_migrations table
 * exists on disk in the configured migrations directory (Knex config).
 *
 * Exports verifyMigrations() for programmatic use (tests), and also runs
 * as a CLI. Respects SKIP_VERIFY_MIGRATIONS=true to allow local bypass.
 */
const fs = require('fs');
const path = require('path');
const knex = require('knex');
// Load server .env via centralized loader
require(path.join(__dirname, '..', 'env'));

async function verifyMigrations() {
  if (process.env.SKIP_VERIFY_MIGRATIONS === 'true') {
    console.log('[verify:migrations] SKIP_VERIFY_MIGRATIONS=true -> skipping migration verification');
    return { skipped: true };
  }

  const knexfile = require('../knexfile');
  // Reuse same selection logic as server/db/index.js
  const isProduction = process.env.NODE_ENV === 'production';
  const forcePostgres = process.env.USE_POSTGRES === 'true' || false;
  const autoDetectPostgres = Boolean(process.env.SUPABASE_DB_URL) && process.env.USE_POSTGRES_AUTO_DETECT !== 'false';
  // During tests (Jest sets NODE_ENV='test') prefer the 'test' knex config even
  // if SUPABASE_DB_URL is present. This prevents local/CI tests from attempting
  // to contact a remote Postgres instance unless explicitly requested.
  let env;
  if (process.env.NODE_ENV === 'test') {
    env = 'test';
  } else {
    env = (isProduction || forcePostgres || autoDetectPostgres) ? 'production' : (process.env.NODE_ENV || 'development');
  }

  const cfg = knexfile[env];
  if (!cfg) {
    throw new Error(`[verify:migrations] knex config for environment "${env}" not found`);
  }

  const migrationsDir = (cfg.migrations && cfg.migrations.directory) ? cfg.migrations.directory : path.join(__dirname, '..', 'db', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`[verify:migrations] migrations directory does not exist: ${migrationsDir}`);
  }

  const db = knex(cfg);
  try {
    const rows = await db('knex_migrations').select('name');
    const dbNames = rows.map(r => r.name).filter(Boolean);

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));

    const missing = dbNames.filter(n => !files.includes(n));
    const orphaned = files.filter(f => !dbNames.includes(f));

    if (missing.length > 0) {
      console.error('[verify:migrations] ERROR: DB lists migrations not present on disk:', missing);
      await db.destroy();
      const err = new Error('Missing migrations: ' + missing.join(', '));
      err.missing = missing;
      throw err;
    }

    if (orphaned.length > 0) {
      console.warn('[verify:migrations] WARNING: Files on disk not present in DB migrations table (orphaned):', orphaned);
    }

    console.log('[verify:migrations] OK: database migrations match files on disk');
    await db.destroy();
    return { missing: [], orphaned };
  } catch (err) {
    await db.destroy();
    throw err;
  }
}

// CLI entrypoint
if (require.main === module) {
  verifyMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[verify:migrations] FAILED:', err.message || err);
      process.exit(1);
    });
}

module.exports = { verifyMigrations };
