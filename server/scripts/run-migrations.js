#!/usr/bin/env node
/**
 * server/scripts/run-migrations.js
 *
 * Runs Knex migrations programmatically using the same knexfile configuration
 * the server uses. This is used by `npm start` via `prestart` so Railway can
 * keep the DB schema in sync without requiring an interactive shell.
 */

const path = require('path');

// Ensure server/.env is loaded (no-op in Railway where vars come from the platform).
require(path.join(__dirname, '..', 'env'));

function resolveKnexEnv() {
  // Knex supports arbitrary env names; our knexfile exports development/test/production.
  const nodeEnv = (process.env.NODE_ENV || 'development').trim();
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'test') return 'test';
  return 'development';
}

async function runMigrations() {
  if (process.env.SKIP_RUN_MIGRATIONS === 'true') {
    console.log('[migrations] SKIP_RUN_MIGRATIONS=true -> skipping migrations');
    return;
  }

  const knex = require('knex');
  const knexfile = require(path.join(__dirname, '..', 'knexfile'));

  const env = resolveKnexEnv();
  const cfg = knexfile[env];
  if (!cfg) {
    throw new Error(`[migrations] knex config for environment "${env}" not found`);
  }

  const db = knex(cfg);
  try {
    const result = await db.migrate.latest();
    const batch = result?.[0];
    const files = result?.[1];

    if (Array.isArray(files) && files.length > 0) {
      console.log(`[migrations] Applied batch ${batch}: ${files.join(', ')}`);
    } else {
      console.log('[migrations] No pending migrations');
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrations] FAILED:', err?.message || err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
