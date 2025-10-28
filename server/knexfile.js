// server/knexfile.js
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
    connection: {
      connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    },
    migrations: {
      directory: path.join(__dirname, 'db/migrations')
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};