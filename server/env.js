const path = require('path');
// Idempotent environment loader for server scripts.
// Use require('./env') from other server modules instead of calling dotenv.config()
// multiple times. This makes sure .env is loaded exactly once and is easy to mock
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

// Normalize SUPABASE_URL to avoid subtle issuer / URL-join mismatches.
// - Many Supabase-issued JWTs use `iss = <SUPABASE_URL>/auth/v1` (no trailing slash).
// - Some config sources include a trailing slash; normalize to reduce drift.
if (process.env.SUPABASE_URL && typeof process.env.SUPABASE_URL === 'string') {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL.trim().replace(/\/+$/, '');
}

// Normalize Google key aliases so worker code can rely on GOOGLE_MAPS_API_KEY even
// if only the historical GOOGLE_PLACES_API_KEY value is set.
if (!process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_PLACES_API_KEY) {
  process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
}

// Frontend builds often only set the Vite-prefixed env var.
// Map it to the server-side name so backend diagnostics + POI tooling can run.
if (!process.env.GOOGLE_MAPS_API_KEY && process.env.VITE_GOOGLE_MAPS_API_KEY) {
  process.env.GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;
}

// Back-compat alias used in some deployments/logs.
// Prefer GOOGLE_MAPS_API_KEY, but accept MAPS_API_KEY if provided.
if (!process.env.GOOGLE_MAPS_API_KEY && process.env.MAPS_API_KEY) {
  process.env.GOOGLE_MAPS_API_KEY = process.env.MAPS_API_KEY;
}

// Safe default: If LangChain API key is missing, explicitly disable tracing
// to prevent 403 errors from trace upload attempts
if (!process.env.LANGCHAIN_API_KEY || process.env.LANGCHAIN_API_KEY.trim() === '') {
  process.env.LANGCHAIN_TRACING_V2 = 'false';
  console.warn('[env] LangChain API key missing; disabling tracing to prevent network errors.');
}

module.exports = process.env;
