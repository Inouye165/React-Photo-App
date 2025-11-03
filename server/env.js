const path = require('path');
// Idempotent environment loader for server scripts.
// Use require('./env') from other server modules instead of calling dotenv.config()
// multiple times. This ensures .env is loaded exactly once and is easy to mock
// in tests by setting process.env beforehand.
if (!process.env.__SERVER_ENV_LOADED) {
  try {
    // Prefer the server/.env file next to this loader
    const envPath = path.join(__dirname, '.env');
    require('dotenv').config({ path: envPath });
    // Mark as loaded so subsequent requires are no-ops
    process.env.__SERVER_ENV_LOADED = '1';
  } catch (err) {
    // If dotenv isn't available or load fails, don't crash here; callers
    // should validate required env vars at runtime. Keep a console warn to
    // aid debugging.
  console.warn('[env] Failed to load server/.env:', err && err.message ? err.message : err);
  }
}

module.exports = process.env;
