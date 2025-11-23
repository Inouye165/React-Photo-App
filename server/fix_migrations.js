// DEPRECATED: This script was used to fix migration state for the old local 'users' table
// which has been removed in favor of Supabase Auth.
//
// If you need to fix migration state, use: npx knex migrate:latest
// or manually inspect knex_migrations table

const logger = require('./logger');

logger.warn('This script is deprecated. The local users table has been removed.');
logger.warn('Use: npx knex migrate:latest');
process.exit(1);