// server/config/env.validate.js
// Centralized environment validation for the server.
//
// Security principle:
// - In production, fail closed if critical secrets/config are missing.
// - In test/development, preserve ergonomics by allowing safe defaults or
//   missing keys when the workflow doesn't require them.

const PROD_REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'JWT_SECRET'];

function getNodeEnv(nodeEnv = process.env.NODE_ENV) {
  return String(nodeEnv || 'development').toLowerCase();
}

function isMissingEnvValue(value) {
  if (value == null) return true;
  if (typeof value !== 'string') return false;
  return value.trim() === '';
}

function validateEnv(options = {}) {
  const nodeEnv = getNodeEnv(options.nodeEnv);
  const required = options.required || (nodeEnv === 'production' ? PROD_REQUIRED : []);

  const missing = required.filter((key) => isMissingEnvValue(process.env[key]));
  if (missing.length) {
    // Non-sensitive: never include values.
    throw new Error(`Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }

  // SUPABASE_SERVICE_ROLE_KEY is optional; warn only outside production.
  if (nodeEnv !== 'production' && isMissingEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.warn('[env] WARNING: SUPABASE_SERVICE_ROLE_KEY not set; some admin/storage operations may be limited.');
  }
}

module.exports = { PROD_REQUIRED, validateEnv, getNodeEnv };
