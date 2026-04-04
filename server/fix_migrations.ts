const logger = require('./logger') as {
  warn: (...args: unknown[]) => void;
};

logger.warn('This script is deprecated. The local users table has been removed.');
logger.warn('Use: npx knex migrate:latest');
process.exit(1);

export {};