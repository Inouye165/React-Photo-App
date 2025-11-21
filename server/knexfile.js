// server/knexfile.js
require('./env'); // <-- ADDED: Make sure .env variables are loaded
const path = require('path');

// Determine if we should use Postgres (Supabase) or fallback to SQLite
const forcePostgres = process.env.USE_POSTGRES === 'true';
const autoDetectPostgres = Boolean(process.env.SUPABASE_DB_URL) && process.env.USE_POSTGRES_AUTO_DETECT !== 'false';
const usePostgres = forcePostgres || autoDetectPostgres;

// Define configurations separately
const sqliteConfig = {
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, 'working', 'dev.db')
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.join(__dirname, 'db/migrations')
  },
  pool: {
    afterCreate: (conn, cb) => {
      // Enable foreign key enforcement for sqlite
      conn.run('PRAGMA foreign_keys = ON', cb);
    }
  }
};

const postgresConfig = {
  client: 'pg',
  // IMPORTANT: Use a plain connection string. SSL is configured via the URL
  // (e.g., ?sslmode=require) to avoid conflicts with 'pg' defaults.
  // For Supabase, we need to explicitly disable certificate validation.
  connection: {
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
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
  development: usePostgres ? postgresConfig : sqliteConfig,
  test: {
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'db/migrations')
    },
    pool: {
      afterCreate: (conn, cb) => {
        conn.run('PRAGMA foreign_keys = ON', cb);
      }
    }
  },
  production: postgresConfig
};