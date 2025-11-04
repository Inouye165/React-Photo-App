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

// Preserve any pre-existing NODE_ENV so Jest (or other callers) can
// temporarily override it without the server/.env loader clobbering the
// value. This matters because the test suite runs in NODE_ENV="test" but the
// persisted .env sets NODE_ENV=development. Without restoring the original
// value the script would erroneously think it's running in development and try
// to contact Postgres instead of the sqlite test config.
const preLoadNodeEnv = process.env.NODE_ENV;

// Load server .env via centralized loader. This may mutate NODE_ENV.
require(path.join(__dirname, '..', 'env'));

// Restore NODE_ENV when the caller already set it (e.g. Jest) so downstream
// logic can honour the intended environment. We detect Jest explicitly via
// JEST_WORKER_ID to avoid changing behaviour for regular CLI usage.
if (typeof process.env.JEST_WORKER_ID !== 'undefined' && preLoadNodeEnv) {
  process.env.NODE_ENV = preLoadNodeEnv;
}

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
  const isTestRuntime = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';

  let env;
  if (isTestRuntime) {
    env = 'test';
  } else {
    env = (isProduction || forcePostgres || autoDetectPostgres) ? 'production' : (process.env.NODE_ENV || 'development');
  }

  const cfg = knexfile[env];
  if (!cfg) {
    throw new Error(`[verify:migrations] knex config for environment "${env}" not found`);
  }

  // Prefer a non-pooler/direct DB URL for verification if provided.
  // This avoids PgBouncer quirks that can affect migrations/locks.
  if (env === 'production' && process.env.SUPABASE_DB_URL_MIGRATIONS) {
    // knexfile.production.connection may be a string or object; handle both.
    if (typeof cfg.connection === 'string') {
      cfg.connection = process.env.SUPABASE_DB_URL_MIGRATIONS;
    } else {
      cfg.connection.connectionString = process.env.SUPABASE_DB_URL_MIGRATIONS;
    }
  }

  // Ensure SSL is configured properly for Supabase (reject unauthorized certs).
  if (env === 'production' && cfg.client === 'pg') {
    if (typeof cfg.connection === 'string') {
      // Remove sslmode from connection string as we'll use the ssl object instead
      const connStr = cfg.connection.replace(/[?&]sslmode=[^&]+/, '');
      cfg.connection = {
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
      };
    } else if (cfg.connection && cfg.connection.connectionString) {
      // Remove sslmode from connection string if present
      cfg.connection.connectionString = cfg.connection.connectionString.replace(/[?&]sslmode=[^&]+/, '');
      if (!cfg.connection.ssl) {
        cfg.connection.ssl = { rejectUnauthorized: false };
      }
    }
  }

  const migrationsDir = (cfg.migrations && cfg.migrations.directory) ? cfg.migrations.directory : path.join(__dirname, '..', 'db', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`[verify:migrations] migrations directory does not exist: ${migrationsDir}`);
  }

  const db = knex(cfg);
  try {
    // Be graceful on fresh databases (table may not exist yet).
    const hasTable = await db.schema.hasTable('knex_migrations');
    if (!hasTable) {
      console.log('[verify:migrations] OK: knex_migrations not found yet (fresh DB) — nothing to verify.');
      await db.destroy();
      return { missing: [], orphaned: [] };
    }

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
