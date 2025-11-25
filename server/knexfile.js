// server/knexfile.js
require('./env');
const path = require('path');

// PostgreSQL-only configuration
// All environments (dev, test, prod) use PostgreSQL for dev/prod parity
const postgresConfig = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: {
      rejectUnauthorized: false
    }
  },
  migrations: {
    directory: path.join(__dirname, 'db/migrations')
  },
  pool: {
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(process.env.DB_POOL_MAX || '20', 10)
  }
};

module.exports = {
  development: postgresConfig,
  test: postgresConfig,
  production: postgresConfig
};