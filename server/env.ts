import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Idempotent environment loader for server scripts.
// Use require('./env') from other server modules instead of calling dotenv.config()
// multiple times. This makes sure .env is loaded exactly once and is easy to mock
// in tests by setting process.env beforehand.
if (!process.env.__SERVER_ENV_LOADED) {
  try {
    // Prefer the server/.env file next to this loader.
    // When running compiled output (server/dist), this loader lives in dist/, so
    // fall back to ../.env.
    const candidatePaths = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')];
    const envPath = candidatePaths.find((candidate) => fs.existsSync(candidate)) ?? candidatePaths[0];
    dotenv.config({ path: envPath });
    // Mark as loaded so subsequent requires are no-ops
    process.env.__SERVER_ENV_LOADED = '1';
  } catch (err) {
    // If dotenv isn't available or load fails, don't crash here; callers
    // should validate required env vars at runtime. Keep a console warn to
    // aid debugging.
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[env] Failed to load server/.env:', message);
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

function readTrimmedEnv(name: string): string {
  const value = process.env[name];
  if (value == null) return '';
  return typeof value === 'string' ? value.trim() : String(value).trim();
}

// LangSmith renamed / alternative env vars are common across deployments.
// Normalize so the rest of the codebase can consistently rely on LANGCHAIN_*.
// - API Key: LANGCHAIN_API_KEY (legacy) or LANGSMITH_API_KEY (common)
// - Tracing: LANGCHAIN_TRACING_V2 or LANGSMITH_TRACING
if (!readTrimmedEnv('LANGCHAIN_API_KEY') && readTrimmedEnv('LANGSMITH_API_KEY')) {
  process.env.LANGCHAIN_API_KEY = process.env.LANGSMITH_API_KEY;
}
if (!readTrimmedEnv('LANGSMITH_API_KEY') && readTrimmedEnv('LANGCHAIN_API_KEY')) {
  process.env.LANGSMITH_API_KEY = process.env.LANGCHAIN_API_KEY;
}

if (!readTrimmedEnv('LANGCHAIN_TRACING_V2') && readTrimmedEnv('LANGSMITH_TRACING')) {
  process.env.LANGCHAIN_TRACING_V2 = process.env.LANGSMITH_TRACING;
}
if (!readTrimmedEnv('LANGSMITH_TRACING') && readTrimmedEnv('LANGCHAIN_TRACING_V2')) {
  process.env.LANGSMITH_TRACING = process.env.LANGCHAIN_TRACING_V2;
}

// Safe default: If LangChain API key is missing, explicitly disable tracing
// to prevent 403 errors from trace upload attempts
if (!readTrimmedEnv('LANGCHAIN_API_KEY') && !readTrimmedEnv('LANGSMITH_API_KEY')) {
  process.env.LANGCHAIN_TRACING_V2 = 'false';
  process.env.LANGSMITH_TRACING = 'false';
  console.log('[env] LangChain/LangSmith API key missing; disabling tracing to prevent network errors.');
}

const exportedEnv: NodeJS.ProcessEnv = process.env;
export = exportedEnv;