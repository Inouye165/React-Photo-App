// server/db/index.js
const knex = require('knex');
const path = require('path');
const fs = require('fs');
const knexConfig = require('../knexfile');

// Determine the environment, defaulting to 'development'
const environment = process.env.NODE_ENV || 'development';

// Safety: for local development we prefer a reliable sqlite fallback so the
// server can start even when the remote Postgres (Supabase) is unreachable
// (for example on machines without IPv6 routing). To force using Postgres
// locally set the env var `USE_POSTGRES=true`.
const isProduction = environment === 'production';
const forcePostgres = process.env.USE_POSTGRES === 'true' || false;

// Auto-detect Postgres when a Supabase DB URL is explicitly present in the
// environment. This makes local development convenient when you intentionally
// configure a DB URL, but it can be disabled by setting USE_POSTGRES_AUTO_DETECT=false.
const autoDetectPostgres = Boolean(process.env.SUPABASE_DB_URL) && process.env.USE_POSTGRES_AUTO_DETECT !== 'false';

let db;
if (isProduction || forcePostgres || autoDetectPostgres) {
	// In production, when explicitly requested, or when a DB URL is present,
	// use the configured Postgres DB (e.g., Supabase)
	if (autoDetectPostgres) {
		console.log('[db] Auto-detect enabled: using Postgres because SUPABASE_DB_URL is present');
	}
	db = knex(knexConfig[environment]);
} else {
	// Local dev fallback: use sqlite file under server/working/dev.db so data
	// persists between restarts (easier than :memory:), and the app can run
	// without depending on remote DB network availability.
	try {
		const workingDir = path.join(__dirname, '..', 'working');
		if (!fs.existsSync(workingDir)) {
			fs.mkdirSync(workingDir, { recursive: true });
		}

		const sqliteFile = path.join(workingDir, 'dev.db');

		const sqliteConfig = {
			client: 'sqlite3',
			connection: {
				filename: sqliteFile
			},
			useNullAsDefault: true,
			migrations: knexConfig.test && knexConfig.test.migrations,
			pool: knexConfig.test && knexConfig.test.pool
		};

		console.warn('[db] Using sqlite fallback for local development:', sqliteFile);
		db = knex(sqliteConfig);
	} catch (err) {
		// If something goes wrong creating the fallback, fall back to the
		// original behaviour and let the error surface so it's obvious.
		console.error('[db] Failed to create sqlite fallback, attempting configured DB:', err.message);
		db = knex(knexConfig[environment]);
	}
}

module.exports = db;