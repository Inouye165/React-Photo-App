// server/config/env.js
// Single source of truth for reading server environment variables.
//
// IMPORTANT:
// - Do not read secrets via scattered `process.env.X || 'default'` patterns.
// - In production, this module FAILS FAST when required config is missing.
// - In test/dev, it provides safe defaults for local workflows.

const { validateEnv, getNodeEnv } = require('./env.validate');

let cachedConfig = null;

function normalizeUrlNoTrailingSlash(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
}

function readTrimmed(name) {
  const value = process.env[name];
  if (value == null) return '';
  return typeof value === 'string' ? value.trim() : String(value);
}

function buildConfig() {
  const nodeEnv = getNodeEnv();
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  // Enforce production-only required env vars.
  validateEnv({ nodeEnv });

  const jwtSecretFromEnv = readTrimmed('JWT_SECRET');
  const jwtSecret = isProduction
    ? jwtSecretFromEnv
    : (jwtSecretFromEnv || (isTest ? 'test-jwt-secret-key-for-testing-only' : 'dev-jwt-secret-not-for-production'));

  const supabaseUrl = readTrimmed('SUPABASE_URL');
  const normalizedSupabaseUrl = normalizeUrlNoTrailingSlash(supabaseUrl);
  const supabaseAnonKey = readTrimmed('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = readTrimmed('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseJwtSecret = readTrimmed('SUPABASE_JWT_SECRET');

  // LangSmith/LangChain tracing support.
  // Some deployments use LANGSMITH_* instead of LANGCHAIN_*.
  const langchainApiKey = readTrimmed('LANGCHAIN_API_KEY') || readTrimmed('LANGSMITH_API_KEY');
  const langchainTracingV2 = readTrimmed('LANGCHAIN_TRACING_V2') || readTrimmed('LANGSMITH_TRACING');

  // Server-side Google Places/Maps usage (POI + foodPlaces).
  // In some environments only the frontend-prefixed var exists.
  const googleMapsApiKey = readTrimmed('GOOGLE_MAPS_API_KEY') || readTrimmed('VITE_GOOGLE_MAPS_API_KEY');

  const thumbnailSigningSecretFromEnv = readTrimmed('THUMBNAIL_SIGNING_SECRET');
  const thumbnailSigningSecret = thumbnailSigningSecretFromEnv || jwtSecret;

  return {
    nodeEnv,
    isProduction,
    isTest,

    jwtSecret,

    supabase: {
      url: normalizedSupabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: supabaseServiceRoleKey,
      jwtSecret: supabaseJwtSecret
    },

    google: {
      mapsApiKey: googleMapsApiKey
    },

    langchain: {
      apiKey: langchainApiKey,
      tracingV2: langchainTracingV2
    },

    thumbnailSigningSecret
  };
}

export function getConfig() {
  if (cachedConfig) return cachedConfig;
  cachedConfig = buildConfig();
  return cachedConfig;
}

// Test helper: allow isolated module reload patterns.
export function __resetForTests() {
  cachedConfig = null;
}