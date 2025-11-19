// server/knexfile.js
require('./env'); // <-- ADDED: Make sure .env variables are loaded
const path = require('path');

module.exports = {
  development: {
    // Use a local sqlite3 database for development to avoid sharing the
    // team's Supabase/Postgres instance. Each developer gets an isolated
    // file-based DB at server/working/dev.db.
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
  },
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
  production: {
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
  }
};