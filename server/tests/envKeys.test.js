const fs = require('fs');
const path = require('path');

// This test used to rely on server/.env directly, which is gitignored (secrets).
// To avoid committing secrets while still validating presence of required keys,
// we first try to read .env (developer local), and if missing fall back to .env.ci
// which is a committed placeholder file for CI.
// List of all required/used environment keys (from .env, env.validate.js, and codebase)
const REQUIRED_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'OPENAI_API_KEY',
  'USE_LANGCHAIN',
  'NOMINATIM_USER_AGENT',
  'JWT_EXPIRES_IN',
  'PORT',
  'NODE_ENV',
  'ALLOW_DEV_DEBUG',
  'ENABLE_HTTPS',
  'FORCE_HTTPS',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'AUTH_RATE_LIMIT_MAX',
  'UPLOAD_RATE_LIMIT_MAX',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_URL_MIGRATIONS',
  'SUPABASE_STORAGE_ACCESS_KEY_ID',
  'SUPABASE_STORAGE_SECRET_KEY',
  'MAX_FILE_SIZE',
  'ALLOWED_FILE_TYPES',
  'CORS_ORIGIN',
  'CORS_CREDENTIALS',
  'GOOGLE_API_KEY',
  'GOOGLE_CSE_ID',
  'LANGCHAIN_TRACING_V2',
  'LANGCHAIN_API_KEY',
  'LANGCHAIN_PROJECT',
  'GOOGLE_PLACES_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'SERPAPI_API_KEY',
];

describe('Environment configuration', () => {
  const rootDir = path.join(__dirname, '..');
  const primaryEnvPath = path.join(rootDir, '.env');
  const ciEnvPath = path.join(rootDir, '.env.ci');
  const exampleEnvPath = path.join(rootDir, '.env.example');
  let envContents;
  if (fs.existsSync(primaryEnvPath)) {
    envContents = fs.readFileSync(primaryEnvPath, 'utf8');
  } else if (fs.existsSync(ciEnvPath)) {
    envContents = fs.readFileSync(ciEnvPath, 'utf8');
  } else if (fs.existsSync(exampleEnvPath)) {
    envContents = fs.readFileSync(exampleEnvPath, 'utf8');
  } else {
    throw new Error('Neither .env, .env.ci, nor .env.example found for environment key validation');
  }

  for (const key of REQUIRED_KEYS) {
    test(`server environment defines ${key}`, () => {
      expect(envContents).toMatch(new RegExp(`(^|\n)${key}=.+`));
    });
  }
});
