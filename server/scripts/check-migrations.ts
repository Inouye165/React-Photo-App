#!/usr/bin/env node
/**
 * server/scripts/check-migrations.ts
 *
 * Verifies that every migration listed in the database's knex_migrations table
 * exists on disk in the configured migrations directory (Knex config).
 *
 * Exports verifyMigrations() for programmatic use (tests), and also runs
 * as a CLI. Respects SKIP_VERIFY_MIGRATIONS=true to allow local bypass.
 */

import fs from 'fs';
import path from 'path';
import knexFactory, { type Knex } from 'knex';
import { Client } from 'pg';

import '../env';

type MigrationVerificationResult = {
  skipped?: boolean;
  missing?: string[];
  orphaned?: string[];
};

type MigrationError = Error & {
  code?: string;
  cause?: unknown;
  missing?: string[];
};

type KnexEnvironment = 'development' | 'test' | 'production';

type KnexConfigMap = Record<string, Knex.Config>;
type ConnectionWithExtras = {
  connectionString?: string;
  ssl?: false | { rejectUnauthorized?: boolean };
};

// Preserve any pre-existing NODE_ENV so Jest (or other callers) can
// temporarily override it without the server/.env loader clobbering the
// value. This matters because the test suite runs in NODE_ENV="test" but the
// persisted .env sets NODE_ENV=development. Without restoring the original
// value the script would erroneously think it's running in development and try
// to contact Postgres instead of the sqlite test config.
const preLoadNodeEnv = process.env.NODE_ENV;

// Restore NODE_ENV when the caller already set it (e.g. Jest) so downstream
// logic can honour the intended environment. We detect Jest explicitly via
// JEST_WORKER_ID to avoid changing behaviour for regular CLI usage.
if (typeof process.env.JEST_WORKER_ID !== 'undefined' && preLoadNodeEnv) {
  process.env.NODE_ENV = preLoadNodeEnv;
}

async function verifyMigrations(retryAttempt = 0): Promise<MigrationVerificationResult> {
  if (process.env.SKIP_VERIFY_MIGRATIONS === 'true') {
    console.log('[verify:migrations] SKIP_VERIFY_MIGRATIONS=true -> skipping migration verification');
    return { skipped: true };
  }

  const knexfile = loadKnexfile();

  // Keep environment selection aligned with server/db/index.ts.
  // Earlier auto-detection promoted some development runs to 'production'
  // when SUPABASE_DB_URL was present, which caused SSL configuration mismatches.
  // Respect NODE_ENV directly to preserve parity with the runtime server path.
  const isTestRuntime = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';

  const env: KnexEnvironment = isTestRuntime
    ? 'test'
    : process.env.NODE_ENV === 'production'
      ? 'production'
      : 'development';

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
    } else if (cfg.connection && typeof cfg.connection === 'object') {
      const connection = cfg.connection as ConnectionWithExtras;
      if (typeof connection.connectionString === 'string') {
        connection.connectionString = process.env.SUPABASE_DB_URL_MIGRATIONS;
      }
    }
  }

  // Handle SSL configuration for PostgreSQL - match db/index.ts behavior exactly.
  // This ensures the migration script connects the same way the server does.
  if (cfg.client === 'pg') {
    const envIsDev = env === 'development' || process.env.NODE_ENV === 'development';
    if (typeof cfg.connection === 'string') {
      const connStr = cfg.connection.replace(/[?&]sslmode=[^&]+/, '');
      cfg.connection = {
        connectionString: connStr,
        ssl: envIsDev ? false : { rejectUnauthorized: false },
      };
    } else if (cfg.connection && typeof cfg.connection === 'object') {
      const connection = cfg.connection as ConnectionWithExtras;
      if (typeof connection.connectionString === 'string') {
        connection.connectionString = connection.connectionString.replace(/[?&]sslmode=[^&]+/, '');
        if (connection.ssl === false || envIsDev) {
          connection.ssl = false;
        } else {
          connection.ssl = { rejectUnauthorized: false };
        }
      }
    }
  }

  const migrationsDir = cfg.migrations?.directory
    ? String(cfg.migrations.directory)
    : path.join(__dirname, '..', 'db', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`[verify:migrations] migrations directory does not exist: ${migrationsDir}`);
  }

  const connectionString = getConnectionString(cfg.connection);

  if (connectionString && cfg.client === 'pg') {
    const ssl = getSslConfig(cfg.connection);
    const testClient = new Client({
      connectionString,
      ssl,
      connectionTimeoutMillis: 10_000,
    });

    try {
      await testClient.connect();
      await testClient.end();
      console.log('[verify:migrations] Pre-flight connection test: OK');
    } catch (preflightErr) {
      await testClient.end().catch(() => undefined);
      const originalError = toMigrationError(preflightErr);
      const enhancedError = new Error(
        `Database connection failed: ${originalError.message}\n` +
          `  Host: ${safeHostname(connectionString)}\n` +
          `  Code: ${originalError.code || '(none)'}`
      ) as MigrationError;
      enhancedError.code = originalError.code;
      enhancedError.cause = originalError;
      throw enhancedError;
    }
  }

  const db = knexFactory(cfg);
  try {
    const hasTable = await db.schema.hasTable('knex_migrations');
    if (!hasTable) {
      console.log('[verify:migrations] OK: knex_migrations not found yet (fresh DB) - nothing to verify.');
      return { missing: [], orphaned: [] };
    }

    const rows = await db<{ name: string | null }>('knex_migrations').select('name');
    const dbNames = rows.map((row) => row.name).filter((name): name is string => Boolean(name));

    const files = fs.readdirSync(migrationsDir).filter((fileName) => fileName.endsWith('.js'));

    const missing = dbNames.filter((name) => !files.includes(name));
    const orphaned = files.filter((fileName) => !dbNames.includes(fileName));

    if (missing.length > 0) {
      console.error('[verify:migrations] ERROR: DB lists migrations not present on disk:', missing);
      const err = new Error(`Missing migrations: ${missing.join(', ')}`) as MigrationError;
      err.missing = missing;
      throw err;
    }

    if (orphaned.length > 0) {
      console.warn(
        '[verify:migrations] WARNING: Files on disk not present in DB migrations table (orphaned):',
        orphaned
      );
    }

    console.log('[verify:migrations] OK: database migrations match files on disk');
    return { missing: [], orphaned };
  } catch (error) {
    const err = toMigrationError(error);
    const isNetworkError = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
    const maxRetries = 3;

    if (isNetworkError && retryAttempt < maxRetries) {
      const delayMs = 2_000 * (retryAttempt + 1);
      console.log(
        `[verify:migrations] Network error (${err.code}), retrying in ${delayMs}ms (attempt ${retryAttempt + 1}/${maxRetries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return verifyMigrations(retryAttempt + 1);
    }

    throw err;
  } finally {
    await db.destroy();
  }
}

function loadKnexfile(): KnexConfigMap {
  const rootDir = path.resolve(__dirname, '..');
  const candidateJsPaths = [path.join(rootDir, 'knexfile.js'), path.join(rootDir, 'dist', 'knexfile.js')];

  for (const jsPath of candidateJsPaths) {
    if (fs.existsSync(jsPath)) {
      return require(jsPath) as KnexConfigMap;
    }
  }

  const tsPath = path.join(rootDir, 'knexfile.ts');
  if (fs.existsSync(tsPath)) {
    try {
      require('tsx/cjs');
      return require(tsPath) as KnexConfigMap;
    } catch {
      throw new Error(
        '[verify:migrations] knexfile.ts detected but could not be loaded. Run npm --prefix server run build or ensure tsx is installed.'
      );
    }
  }

  throw new Error('[verify:migrations] knex config not found. Expected server/knexfile.js, server/dist/knexfile.js, or server/knexfile.ts');
}

/**
 * Diagnose connection errors and provide helpful messages.
 * Knex pool timeout errors are notoriously unhelpful - this function
 * extracts the real cause from the error chain.
 */
function diagnoseConnectionError(error: unknown): string {
  const err = toMigrationError(error);
  const lines = ['[verify:migrations] Connection diagnostics:'];

  if (err.code === 'ENOTFOUND') {
    lines.push('  ❌ DNS resolution failed: Cannot resolve hostname');
    lines.push('  💡 Check if the database URL hostname is correct');
    lines.push('  💡 Try: ping <hostname> or nslookup <hostname>');
  } else if (err.code === 'ECONNREFUSED') {
    lines.push('  ❌ Connection refused: Database server not accepting connections');
    lines.push('  💡 Check if the database is running and port is correct');
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    lines.push('  ❌ Connection timed out: Network or firewall issue');
    lines.push('  💡 Check firewall rules and network connectivity');
  } else if (err.message.includes('SSL') || err.message.includes('certificate')) {
    lines.push(`  ❌ SSL/TLS error: ${err.message}`);
    lines.push('  💡 Check SSL configuration in knexfile.ts');
  } else if (err.message.includes('password') || err.message.includes('authentication')) {
    lines.push(`  ❌ Authentication failed: ${err.message}`);
    lines.push('  💡 Check database credentials in .env');
  } else if (err.message.includes('pool') || err.message.includes('timeout')) {
    lines.push('  ❌ Pool timeout (but the REAL cause may be hidden below)');
    lines.push('  💡 This often means the underlying connection failed');
  }

  lines.push(`  📋 Error code: ${err.code || '(none)'}`);
  lines.push(`  📋 Error message: ${err.message}`);

  const cause = err.cause;
  if (cause instanceof Error) {
    lines.push(`  📋 Caused by: ${cause.message || String(cause)}`);
    const causeWithCode = cause as MigrationError;
    if (causeWithCode.code) {
      lines.push(`  📋 Cause code: ${causeWithCode.code}`);
    }
  }

  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const url = new URL(dbUrl);
      lines.push(`  🔗 Attempted host: ${url.hostname}:${url.port || '5432'}`);
    } catch {
      lines.push('  🔗 Database URL: (could not parse)');
    }
  }

  return lines.join('\n');
}

function getConnectionString(connection: Knex.Config['connection']): string | undefined {
  if (!connection) return undefined;
  if (typeof connection === 'string') return connection;
  if (typeof connection === 'object') {
    const staticConnection = connection as ConnectionWithExtras;
    return typeof staticConnection.connectionString === 'string' ? staticConnection.connectionString : undefined;
  }
  return undefined;
}

function getSslConfig(connection: Knex.Config['connection']) {
  if (!connection || typeof connection === 'string') {
    return { rejectUnauthorized: false };
  }

  if (typeof connection === 'object') {
    const staticConnection = connection as ConnectionWithExtras;
    return staticConnection.ssl === false ? false : (staticConnection.ssl ?? { rejectUnauthorized: false });
  }

  return { rejectUnauthorized: false };
}

function safeHostname(connectionString: string): string {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '(unknown)';
  }
}

function toMigrationError(error: unknown): MigrationError {
  if (error instanceof Error) {
    return error as MigrationError;
  }
  return new Error(String(error)) as MigrationError;
}

if (require.main === module) {
  verifyMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      const err = toMigrationError(error);
      console.error('[verify:migrations] FAILED:', err.message || err);
      console.error('');
      console.error(diagnoseConnectionError(err));
      process.exit(1);
    });
}

export { diagnoseConnectionError, verifyMigrations };