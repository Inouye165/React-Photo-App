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

async function verifyMigrations(retryAttempt = 0) {
  if (process.env.SKIP_VERIFY_MIGRATIONS === 'true') {
    console.log('[verify:migrations] SKIP_VERIFY_MIGRATIONS=true -> skipping migration verification');
    return { skipped: true };
  }

  const knexfile = require('../knexfile');
  
  // IMPORTANT: Use the same environment selection logic as server/db/index.js
  // Previously, this script had "auto-detect" logic that switched to 'production'
  // config when SUPABASE_DB_URL was present, even in development. This caused
  // SSL/connection failures because production config expects strict SSL with
  // CA certificates, while the main server uses relaxed SSL in development.
  //
  // The fix: Always respect NODE_ENV, just like db/index.js does.
  const isTestRuntime = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';

  let env;
  if (isTestRuntime) {
    env = 'test';
  } else {
    // Match db/index.js: use NODE_ENV directly, defaulting to 'development'
    env = process.env.NODE_ENV || 'development';
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

  // Handle SSL configuration for PostgreSQL - match db/index.js behavior exactly
  // This ensures the migration script connects the same way the server does.
  if (cfg.client === 'pg') {
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
      // Make sure SSL config exists with relaxed verification
      cfg.connection.ssl = { rejectUnauthorized: false };
    }
  }

  const migrationsDir = (cfg.migrations && cfg.migrations.directory) ? cfg.migrations.directory : path.join(__dirname, '..', 'db', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`[verify:migrations] migrations directory does not exist: ${migrationsDir}`);
  }

  // Pre-flight connection test using raw pg client to get better error messages
  // Knex pool timeouts hide the real error; this catches DNS/SSL/auth issues early
  const connectionString = typeof cfg.connection === 'string' 
    ? cfg.connection 
    : cfg.connection?.connectionString;
  
  if (connectionString && cfg.client === 'pg') {
    const { Client } = require('pg');
    const testClient = new Client({
      connectionString,
      ssl: cfg.connection?.ssl || { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000 // 10 second timeout for pre-flight
    });
    
    try {
      await testClient.connect();
      await testClient.end();
      console.log('[verify:migrations] Pre-flight connection test: OK');
    } catch (preflightErr) {
      await testClient.end().catch(() => {}); // Ignore cleanup errors
      // Re-throw with more context - this error has the REAL cause
      const enhancedErr = new Error(
        `Database connection failed: ${preflightErr.message}\n` +
        `  Host: ${(() => { try { return new URL(connectionString).hostname; } catch { return '(unknown)'; } })()}\n` +
        `  Code: ${preflightErr.code || '(none)'}`
      );
      enhancedErr.code = preflightErr.code;
      enhancedErr.cause = preflightErr;
      throw enhancedErr;
    }
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
    
    // Retry on DNS/network errors (ENOTFOUND, ECONNREFUSED) up to 3 times with delay
    const isDnsError = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
    const maxRetries = 3;
    
    if (isDnsError && retryAttempt < maxRetries) {
      const delayMs = 2000 * (retryAttempt + 1); // 2s, 4s, 6s
      console.log(`[verify:migrations] Network error (${err.code}), retrying in ${delayMs}ms (attempt ${retryAttempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return verifyMigrations(retryAttempt + 1);
    }
    
    throw err;
  }
}

/**
 * Diagnose connection errors and provide helpful messages.
 * Knex pool timeout errors are notoriously unhelpful - this function
 * extracts the real cause from the error chain.
 */
function diagnoseConnectionError(err) {
  const lines = ['[verify:migrations] Connection diagnostics:'];
  
  // Check for common root causes
  if (err.code === 'ENOTFOUND') {
    lines.push(`  ❌ DNS resolution failed: Cannot resolve hostname`);
    lines.push(`  💡 Check if the database URL hostname is correct`);
    lines.push(`  💡 Try: ping <hostname> or nslookup <hostname>`);
  } else if (err.code === 'ECONNREFUSED') {
    lines.push(`  ❌ Connection refused: Database server not accepting connections`);
    lines.push(`  💡 Check if the database is running and port is correct`);
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    lines.push(`  ❌ Connection timed out: Network or firewall issue`);
    lines.push(`  💡 Check firewall rules and network connectivity`);
  } else if (err.message?.includes('SSL') || err.message?.includes('certificate')) {
    lines.push(`  ❌ SSL/TLS error: ${err.message}`);
    lines.push(`  💡 Check SSL configuration in knexfile.js`);
  } else if (err.message?.includes('password') || err.message?.includes('authentication')) {
    lines.push(`  ❌ Authentication failed: ${err.message}`);
    lines.push(`  💡 Check database credentials in .env`);
  } else if (err.message?.includes('pool') || err.message?.includes('timeout')) {
    lines.push(`  ❌ Pool timeout (but the REAL cause may be hidden below)`);
    lines.push(`  💡 This often means the underlying connection failed`);
  }
  
  // Show error details
  lines.push(`  📋 Error code: ${err.code || '(none)'}`);
  lines.push(`  📋 Error message: ${err.message}`);
  
  // Check for nested/cause errors (Knex wraps errors)
  if (err.cause) {
    lines.push(`  📋 Caused by: ${err.cause.message || err.cause}`);
    if (err.cause.code) {
      lines.push(`  📋 Cause code: ${err.cause.code}`);
    }
  }
  
  // Show which URL was attempted
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const url = new URL(dbUrl);
      lines.push(`  🔗 Attempted host: ${url.hostname}:${url.port || 5432}`);
    } catch {
      lines.push(`  🔗 Database URL: (could not parse)`);
    }
  }
  
  return lines.join('\n');
}

// CLI entrypoint
if (require.main === module) {
  verifyMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[verify:migrations] FAILED:', err.message || err);
      console.error('');
      console.error(diagnoseConnectionError(err));
      process.exit(1);
    });
}

module.exports = { verifyMigrations, diagnoseConnectionError };
