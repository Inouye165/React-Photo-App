// server/config/env.validate.js
const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET'
]; // UPLOAD_MAX_BYTES is optional, default is set in upload code

function validateEnv(required = REQUIRED) {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
}

module.exports = { REQUIRED, validateEnv };
