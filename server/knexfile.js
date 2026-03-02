const path = require('path');
const fs = require('fs');

// Minimal JS knexfile used by CI/test runs when TypeScript is not available.
const migrationsDir = path.join(__dirname, 'db', 'migrations');

const resolveCaPath = () => {
  const direct = path.join(__dirname, 'prod-ca-2021.crt');
  if (fs.existsSync(direct)) return direct;
  const alt = path.join(__dirname, '..', 'prod-ca-2021.crt');
  if (fs.existsSync(alt)) return alt;
  return null;
};

const loadCa = () => {
  const p = resolveCaPath();
  if (!p) return undefined;
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return undefined;
  }
};

const prodConnection = (() => {
  const connStr = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null;
  const ca = loadCa();
  // Return connection object to match server/knexfile.ts expectations in tests
  return {
    connectionString: connStr,
    ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true }
  };
})();

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
    connection: prodConnection,
    migrations: { directory: migrationsDir }
  }
};
