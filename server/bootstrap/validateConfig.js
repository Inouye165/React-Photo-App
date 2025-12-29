const { BootError } = require('./bootError');

function maskSecret(value) {
  if (!value) return '(missing)';
  return '•••' + String(value).slice(-4);
}

function presentOrMissing(value) {
  return value ? '(present)' : '(missing)';
}

function validateDatabaseConfig() {
  if (process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) return;

  const message = [
    '[server] FATAL: PostgreSQL not configured',
    '[server] DATABASE_URL or SUPABASE_DB_URL is required',
    '[server] For local development, run: docker-compose up -d db',
    '[server] Then set DATABASE_URL in server/.env',
  ].join('\n');

  throw new BootError(message, { code: 'MISSING_DATABASE_CONFIG' });
}

function validateAiKeys() {
  if (process.env.NODE_ENV === 'test') return;

  const missing = [];
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
    missing.push('OPENAI_API_KEY');
  }

  if (missing.length === 0) return;

  const message = [
    '[server] FATAL: Required AI API keys missing',
    ...missing.map((k) => `[server]  - ${k} is required`),
    '[server] AI pipeline will fail without these keys',
    '[server] Server startup blocked to prevent unnecessary API costs',
  ].join('\n');

  throw new BootError(message, { code: 'MISSING_AI_KEYS' });
}

function validateCentralConfig() {
  try {
    // Centralized config module validates production requirements.
    require('../config/env').getConfig();
  } catch (err) {
    const message = err && err.message ? err.message : 'Invalid environment configuration';
    throw new BootError(`[server] FATAL: ${message}`, { code: 'INVALID_ENV_CONFIG', cause: err });
  }
}

function logStartupDiagnostics() {
  const environment = process.env.NODE_ENV || 'development';
  const isProduction = String(environment).toLowerCase() === 'production';

  console.log('[server] Startup configuration diagnostics:');
  console.log(`[server]  - NODE_ENV = ${environment}`);
  // Don't print secrets in production logs.
  console.log(
    `[server]  - DATABASE_URL = ${
      isProduction
        ? presentOrMissing(process.env.DATABASE_URL)
        : process.env.DATABASE_URL
          ? maskSecret(process.env.DATABASE_URL)
          : '(not set)'
    }`
  );
  console.log(
    `[server]  - SUPABASE_DB_URL = ${
      isProduction
        ? presentOrMissing(process.env.SUPABASE_DB_URL)
        : process.env.SUPABASE_DB_URL
          ? maskSecret(process.env.SUPABASE_DB_URL)
          : '(not set)'
    }`
  );
  console.log(
    `[server]  - SUPABASE_URL = ${
      isProduction
        ? presentOrMissing(process.env.SUPABASE_URL)
        : process.env.SUPABASE_URL
          ? maskSecret(process.env.SUPABASE_URL)
          : '(missing)'
    }`
  );
  console.log(
    `[server]  - SUPABASE_SERVICE_ROLE_KEY = ${
      isProduction
        ? presentOrMissing(process.env.SUPABASE_SERVICE_ROLE_KEY)
        : process.env.SUPABASE_SERVICE_ROLE_KEY
          ? `(present) ${maskSecret(process.env.SUPABASE_SERVICE_ROLE_KEY)}`
          : '(missing)'
    }`
  );
  console.log(
    `[server]  - SUPABASE_ANON_KEY = ${
      isProduction
        ? presentOrMissing(process.env.SUPABASE_ANON_KEY)
        : process.env.SUPABASE_ANON_KEY
          ? `(present) ${maskSecret(process.env.SUPABASE_ANON_KEY)}`
          : '(missing)'
    }`
  );
  console.log('[server]  - Database: PostgreSQL (all environments)');
  console.log('[server] End diagnostics');

  // Summarize missing env vars with clear severity.
  // Security: never log values, only presence/absence.
  const missingCritical = [];
  const missingOptional = [];

  // Critical startup gates (validateConfig() will halt on these).
  // - DB config is required in all non-test envs.
  if (process.env.NODE_ENV !== 'test' && !process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
    missingCritical.push('DATABASE_URL (or SUPABASE_DB_URL)');
  }

  // - AI key is required in all non-test envs by validateAiKeys().
  if (process.env.NODE_ENV !== 'test' && (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '')) {
    missingCritical.push('OPENAI_API_KEY');
  }

  // - Production requires these via config/env.validate.js
  if (isProduction) {
    if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL.trim() === '') missingCritical.push('SUPABASE_URL');
    if (!process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY.trim() === '') missingCritical.push('SUPABASE_ANON_KEY');
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === '') missingCritical.push('JWT_SECRET');
  }

  // Optional vars (warning-only).
  if (!process.env.LANGCHAIN_API_KEY || process.env.LANGCHAIN_API_KEY.trim() === '') {
    missingOptional.push('LANGCHAIN_API_KEY');
  }

  if (
    (!process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY.trim() === '') &&
    (!process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_API_KEY.trim() === '') &&
    (!process.env.MAPS_API_KEY || process.env.MAPS_API_KEY.trim() === '')
  ) {
    missingOptional.push('GOOGLE_MAPS_API_KEY (or GOOGLE_PLACES_API_KEY / MAPS_API_KEY)');
  }

  // Recommended for server-side JWT verification (used by auth middleware when present).
  if (!process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_JWT_SECRET.trim() === '') {
    missingOptional.push('SUPABASE_JWT_SECRET');
  }

  if (missingCritical.length) {
    console.warn('[server] Critical env missing; startup will fail:', missingCritical.join(', '));
  }
  if (missingOptional.length) {
    console.warn('[server] Optional env missing; some features may be disabled:', missingOptional.join(', '));
  }

  if (!process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_MAPS_API_KEY && !process.env.MAPS_API_KEY) {
    console.warn('[POI] GOOGLE_MAPS_API_KEY missing; POI lookups disabled');
  }

  return { environment, isProduction };
}

function logVersion() {
  let APP_VERSION = null;
  try {
    APP_VERSION = require('../version.js').APP_VERSION;
  } catch {
    // fallback: not critical
  }
  if (APP_VERSION) {
    console.log('Starting server - version:', APP_VERSION);
  }
}

function validateConfig() {
  logVersion();
  logStartupDiagnostics();
  validateDatabaseConfig();
  validateAiKeys();
  validateCentralConfig();
}

module.exports = {
  validateConfig,
};
