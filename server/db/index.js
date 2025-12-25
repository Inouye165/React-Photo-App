// server/db/index.js
const knex = require('knex');
const knexConfig = require('../knexfile');
const logger = require('../logger');
const metrics = require('../metrics');
const { instrumentKnex } = require('../metrics/knex');

// Determine the environment, defaulting to 'development'
const environment = process.env.NODE_ENV || 'development';

// Validate that DATABASE_URL or SUPABASE_DB_URL is present
if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
	const errorMsg = [
		'[db] ERROR: PostgreSQL not configured.',
		'DATABASE_URL or SUPABASE_DB_URL is required.',
		'For local development, run: docker-compose up -d db',
		'Then set DATABASE_URL in server/.env'
	].join('\n');
	
	logger.error(errorMsg);
	throw new Error(errorMsg);
}

// Use PostgreSQL configuration for the current environment
const config = knexConfig[environment];

// Handle SSL configuration for PostgreSQL
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
		// Make sure SSL config exists
		if (!config.connection.ssl) {
			config.connection.ssl = { rejectUnauthorized: false };
		}
	}

	// Make sure pooled pg clients always have an error handler.
	// Without this, certain server-initiated disconnects can emit an 'error'
	// event on an idle client and crash the Node process.
	const existingPool = config.pool || {};
	const previousAfterCreate = existingPool.afterCreate;
	config.pool = {
		...existingPool,
		afterCreate: (conn, done) => {
			try {
				if (conn && typeof conn.on === 'function') {
					conn.on('error', (err) => {
						logger.error('[db] PostgreSQL client error:', err && err.message ? err.message : err);
					});
				}
			} catch (err) {
				logger.error('[db] Failed to attach PostgreSQL client error handler:', err && err.message ? err.message : err);
			}

			if (typeof previousAfterCreate === 'function') {
				return previousAfterCreate(conn, done);
			}
			return done(null, conn);
		}
	};
}

logger.info(`[db] Initializing PostgreSQL connection for ${environment} environment`);

const db = knex(config);

// Observability: record query duration + low-cardinality operation/table labels.
// SECURITY: Never emit raw SQL in metrics or logs.
try {
	instrumentKnex({ db, metrics });
} catch (err) {
	logger.warn('[db] Knex metrics instrumentation disabled:', err && err.message ? err.message : err);
}

// Handle connection errors gracefully
db.on('query-error', (error) => {
	logger.error('[db] Query error:', error.message);
});

// Test the connection on startup
db.raw('SELECT 1')
  .then(() => logger.info('[db] Database connection verified'))
  .catch((err) => logger.error('[db] Database connection test failed:', err.message));

module.exports = db;