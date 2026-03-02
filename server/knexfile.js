const path = require('path');
// Minimal JS knexfile used by CI/test runs when TypeScript is not available.
const migrationsDir = path.join(__dirname, 'db', 'migrations');

module.exports = {
  development: {
    client: 'pg',
    connection: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null,
    migrations: { directory: migrationsDir }
  },
  test: {
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    migrations: { directory: process.env.TEST_MIGRATIONS_DIR || migrationsDir }
  },
  production: {
    client: 'pg',
    connection: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null,
    migrations: { directory: migrationsDir }
  }
};
