// server/db/index.js
const knex = require('knex');
const knexConfig = require('../knexfile');
const logger = require('../logger');

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
		// Ensure SSL config exists
		if (!config.connection.ssl) {
			config.connection.ssl = { rejectUnauthorized: false };
		}
	}
}

logger.info(`[db] Initializing PostgreSQL connection for ${environment} environment`);

const db = knex(config);

// Handle connection errors gracefully
db.on('query-error', (error) => {
	logger.error('[db] Query error:', error.message);
});

// Test the connection on startup
db.raw('SELECT 1')
  .then(() => logger.info('[db] Database connection verified'))
  .catch((err) => logger.error('[db] Database connection test failed:', err.message));

module.exports = db;