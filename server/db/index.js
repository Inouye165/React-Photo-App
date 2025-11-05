// server/db/index.js
const knex = require('knex');
// NOTE: local sqlite fallback has been removed from this module.
const knexConfig = require('../knexfile');
const logger = require('../logger');

// Determine the environment, defaulting to 'development'
const environment = process.env.NODE_ENV || 'development';

// The server requires a Postgres (Supabase) connection. To opt into Postgres
// in development set `USE_POSTGRES=true` or provide `SUPABASE_DB_URL`.
const isProduction = environment === 'production';
const forcePostgres = process.env.USE_POSTGRES === 'true' || false;

// Auto-detect Postgres when a Supabase DB URL is explicitly present in the
// environment. This makes local development convenient when you intentionally
// configure a DB URL, but it can be disabled by setting USE_POSTGRES_AUTO_DETECT=false.
const autoDetectPostgres = Boolean(process.env.SUPABASE_DB_URL) && process.env.USE_POSTGRES_AUTO_DETECT !== 'false';

let db;
// Require Postgres (Supabase) in all cases. Do NOT fall back to sqlite.
// If you intentionally want local Postgres behavior for development, set
// USE_POSTGRES=true or provide SUPABASE_DB_URL in `server/.env`.
if (isProduction || forcePostgres || autoDetectPostgres) {
	// In production, when explicitly requested, or when a DB URL is present,
	// use the configured Postgres DB (e.g., Supabase).
	// NOTE: when auto-detecting Postgres in a non-production NODE_ENV we must
	// ensure we use the production Postgres configuration (not the
	// development sqlite config). Previously this used `knexConfig[environment]`
	// which could still select the sqlite dev config even when a SUPABASE_DB_URL
	// was present. Prefer the 'production' knex config when autoDetectPostgres
	// or forcePostgres is true and we're not running in production.
	if (autoDetectPostgres) {
		logger.info('[db] Auto-detect enabled: using Postgres because SUPABASE_DB_URL is present');
	}
	const knexEnv = (isProduction) ? environment : 'production';
	const config = knexConfig[knexEnv];

	// Handle SSL configuration for Supabase PostgreSQL.
	// Remove ?sslmode= from connection string and use the ssl object instead
	// to properly configure certificate validation.
	if (config.client === 'pg') {
		if (typeof config.connection === 'string') {
			// Connection is a plain string, convert to object with SSL config
			const cs = config.connection.replace(/[?&]sslmode=[^&]+/, '');
			config.connection = {
				connectionString: cs,
				ssl: { rejectUnauthorized: false }
			};
		} else if (config.connection && config.connection.connectionString) {
			// Connection is already an object, clean up connection string
			config.connection.connectionString = config.connection.connectionString.replace(/[?&]sslmode=[^&]+/, '');
			// Ensure SSL config exists
			if (!config.connection.ssl) {
				config.connection.ssl = { rejectUnauthorized: false };
			}
		}
	}

	db = knex(config);

} else {
	// For test environment we allow the sqlite in-memory fallback so CI and
	// local test runs can execute without an externally configured
	// Postgres/Supabase instance. This keeps behavior predictable for tests
	// while still enforcing Postgres in development/production.
	// Also allow sqlite fallback when explicitly enabled via ALLOW_SQLITE_FALLBACK
	// for integration tests that need the server to listen (NODE_ENV=development).
	if (environment === 'test' || process.env.ALLOW_SQLITE_FALLBACK === 'true') {
		logger.info('[db] Using sqlite in-memory fallback (test or explicitly allowed)');
		db = knex(knexConfig.test);
	} else {
		// Fail fast: sqlite fallback has been intentionally removed for
		// non-test environments. Running without Postgres/Supabase configured
		// is considered a broken state.
		const guidance = [
			'No Postgres/Supabase configuration detected.',
			'Set SUPABASE_DB_URL in server/.env (preferred) or set USE_POSTGRES=true to opt in to Postgres for development.',
			'Local sqlite fallback has been disabled to avoid divergent behavior between environments.'
		].join(' ');

		// Log and throw to surface the misconfiguration immediately during startup.
		logger.error('[db] Fatal configuration error:', guidance);
		throw new Error('[db] Postgres/Supabase not configured. ' + guidance);
	}
}

module.exports = db;