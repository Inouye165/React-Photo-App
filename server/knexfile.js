// server/knexfile.js
require('./env');
const path = require('path');
const fs = require('fs');

const parseIntEnv = (name, defaultValue) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`[FATAL] Invalid integer for ${name}: ${String(raw)}`);
  }
  if (parsed < 0) {
    throw new Error(`[FATAL] Invalid value for ${name}: must be >= 0`);
  }
  return parsed;
};

const isEnvFalse = (name) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return false;
  return String(raw).trim().toLowerCase() === 'false';
};

const validatePoolRange = ({ min, max }) => {
  if (max < min) {
    throw new Error(`[FATAL] Invalid DB pool config: DB_POOL_MAX (${max}) must be >= DB_POOL_MIN (${min})`);
  }
};

// CA certificate path for production SSL
const resolveCaCertPath = () => {
  const direct = path.join(__dirname, 'prod-ca-2021.crt');
  if (fs.existsSync(direct)) return direct;

  // When running from compiled output (server/dist), the cert lives one level up (server/).
  return path.join(__dirname, '..', 'prod-ca-2021.crt');
};

const CA_CERT_PATH = resolveCaCertPath();

// Load CA certificate for production - called at config creation time
const loadCaCert = () => {
  if (!fs.existsSync(CA_CERT_PATH)) {
    throw new Error(
      `[FATAL] Production CA certificate not found at: ${CA_CERT_PATH}\n` +
      `SSL certificate verification cannot be disabled in production.\n` +
      `Please ensure prod-ca-2021.crt is present in the server directory.`
    );
  }
  return fs.readFileSync(CA_CERT_PATH, 'utf8');
};

// SSL configuration based on environment
const getSslConfig = (env) => {
  if (env === 'production') {
    if (isEnvFalse('DB_SSL_REJECT_UNAUTHORIZED')) {
      // External pooler / transaction mode: allow the pooler to handle SSL.
      // This is intentionally opt-in and must never be the default.
      return { rejectUnauthorized: false };
    }
    // Production default: strict SSL with CA verification
    return { rejectUnauthorized: true, ca: loadCaCert() };
  }
  // Development/Test: Allow self-signed certs for local Docker containers
  return {
    rejectUnauthorized: false
  };
};

// PostgreSQL configuration factory
// All environments (dev, test, prod) use PostgreSQL for dev/prod parity
const createPostgresConfig = (env) => {
  const poolMin = parseIntEnv('DB_POOL_MIN', 2);
  const poolMax = parseIntEnv('DB_POOL_MAX', 30);
  validatePoolRange({ min: poolMin, max: poolMax });

  return {
  client: 'pg',
  connection: {
    // Prefer SUPABASE_DB_URL (pooler) over DATABASE_URL (direct) in dev/test
    // because the pooler endpoint (port 6543) is often more reliable.
    //
    // For production migrations/DDL, you may want to provide a direct URL via
    // SUPABASE_DB_URL_MIGRATIONS to avoid PgBouncer/transaction quirks.
    connectionString:
      (env === 'production' && process.env.SUPABASE_DB_URL_MIGRATIONS)
        ? process.env.SUPABASE_DB_URL_MIGRATIONS
        : (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL),
    ssl: getSslConfig(env),
    // Keepalive settings to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  },
  migrations: {
    directory: path.join(__dirname, 'db/migrations')
  },
  pool: {
    min: poolMin,
    max: poolMax,
    // Acquire timeout - how long to wait for a connection
    acquireTimeoutMillis: parseIntEnv('DB_POOL_ACQUIRE_TIMEOUT', 60000),
    // Create timeout - how long to wait when establishing a new connection
    createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT_MS || '30000', 10),
    // Idle timeout - destroy connections idle for this long
    idleTimeoutMillis: parseIntEnv('DB_POOL_IDLE_TIMEOUT', 30000),
    // Reap interval - check for idle connections this often
    reapIntervalMillis: 1000,
    // Create retry interval
    createRetryIntervalMillis: 200,
    // Propagate create error to acquire
    propagateCreateError: false
  },
  // Acquire connection settings
  acquireConnectionTimeout: 30000
  };
};

module.exports = {
  development: createPostgresConfig('development'),
  test: createPostgresConfig('test'),
  production: createPostgresConfig('production')
};