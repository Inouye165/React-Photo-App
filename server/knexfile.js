// server/knexfile.js
require('./env');
const path = require('path');
const fs = require('fs');

// CA certificate path for production SSL
const CA_CERT_PATH = path.join(__dirname, 'prod-ca-2021.crt');

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
    // Production: Strict SSL with CA verification
    return {
      rejectUnauthorized: true,
      ca: loadCaCert()
    };
  }
  // Development/Test: Allow self-signed certs for local Docker containers
  return {
    rejectUnauthorized: false
  };
};

// PostgreSQL configuration factory
// All environments (dev, test, prod) use PostgreSQL for dev/prod parity
const createPostgresConfig = (env) => ({
  client: 'pg',
  connection: {
    // Prefer SUPABASE_DB_URL (pooler) over DATABASE_URL (direct) because the
    // direct endpoint may have DNS/connectivity issues from local networks.
    // The pooler endpoint (port 6543) is more reliable for development.
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    ssl: getSslConfig(env),
    // Keepalive settings to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  },
  migrations: {
    directory: path.join(__dirname, 'db/migrations')
  },
  pool: {
     min: parseInt(process.env.DB_POOL_MIN || (env === 'production' ? '2' : '2'), 10),
     max: parseInt(process.env.DB_POOL_MAX || (env === 'production' ? '30' : '30'), 10),
    // Acquire timeout - how long to wait for a connection
    acquireTimeoutMillis: 30000,
    // Create timeout - how long to wait when establishing a new connection
    createTimeoutMillis: parseInt(process.env.DB_POOL_CREATE_TIMEOUT_MS || '30000', 10),
    // Idle timeout - destroy connections idle for this long
    idleTimeoutMillis: 30000,
    // Reap interval - check for idle connections this often
    reapIntervalMillis: 1000,
    // Create retry interval
    createRetryIntervalMillis: 200,
    // Propagate create error to acquire
    propagateCreateError: false
  },
  // Acquire connection settings
  acquireConnectionTimeout: 30000
});

module.exports = {
  development: createPostgresConfig('development'),
  test: createPostgresConfig('test'),
  production: createPostgresConfig('production')
};