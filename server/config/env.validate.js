// server/config/env.validate.js
const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'JWT_SECRET'
]; // SUPABASE_SERVICE_ROLE_KEY is optional (falls back to ANON_KEY)
// UPLOAD_MAX_BYTES is optional, default is set in upload code

function validateEnv(required = REQUIRED) {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
  
  // Warn if SERVICE_ROLE_KEY is missing (but don't fail)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[env] WARNING: SUPABASE_SERVICE_ROLE_KEY not set, using ANON_KEY for storage operations');
  }
}

module.exports = { REQUIRED, validateEnv };
