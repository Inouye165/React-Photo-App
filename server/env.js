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

// Normalize Google key aliases so worker code can rely on GOOGLE_MAPS_API_KEY even
// if only the historical GOOGLE_PLACES_API_KEY value is set.
if (!process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_PLACES_API_KEY) {
  process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
}

// Safe default: If LangChain API key is missing, explicitly disable tracing
// to prevent 403 errors from trace upload attempts
if (!process.env.LANGCHAIN_API_KEY || process.env.LANGCHAIN_API_KEY.trim() === '') {
  process.env.LANGCHAIN_TRACING_V2 = 'false';
  console.warn('[env] LangChain API key missing; disabling tracing to prevent network errors.');
}

module.exports = process.env;
