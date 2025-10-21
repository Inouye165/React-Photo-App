// server/knexfile.js
const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, 'photos.db')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'db/migrations')
    },
    // Recommended for SQLite to enforce foreign key constraints
    pool: {
      afterCreate: (conn, cb) => {
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
    connection: process.env.DATABASE_URL, // Example: 'postgres://user:pass@host:5432/dbname'
    migrations: {
      directory: path.join(__dirname, 'db/migrations')
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};