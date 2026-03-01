// @ts-nocheck

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../logger');

// Make sure environment variables are loaded when this module is required
// by using the centralized loader. This avoids multiple dotenv.config calls
// while still allowing scripts to require this file directly.
try {
  require(path.join(__dirname, '..', 'env'));
} catch {
  // ignore - env loader is best-effort
}

function ensureSupabaseEnvLoadedFromFiles() {
  const candidatePaths = [
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', '..', '.env.local'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];

  const envPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  dotenv.config({ path: envPath });
}

// Initialize Supabase client with environment variables
let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
let supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
let supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceKey)) {
  ensureSupabaseEnvLoadedFromFiles();
  supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
}

// Helper to build a clear message about missing configuration
function buildMissingMessage(missing: any) {
  return (`Missing required Supabase environment variable(s): ${missing.join(', ')}.\n` +
    'Set them in `server/.env` or export them in your environment. For server-side operations you can provide `SUPABASE_SERVICE_ROLE_KEY` in place of `SUPABASE_ANON_KEY`.');
}

// In test environment, create a test client (tests may mock this)
if (process.env.NODE_ENV === 'test') {
  const testUrl = supabaseUrl || 'https://test.supabase.co';
  const testServiceKey = supabaseServiceKey || 'test-service-role-key';

  const supabase = createClient(testUrl, testServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  module.exports = supabase;
} else {
  // For non-test environments require SUPABASE_URL and either an anon key
  // or a service role key (service role is acceptable for server-side ops).
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseAnonKey && !supabaseServiceKey) missing.push('SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length) {
    const message = buildMissingMessage(missing);
    // Log an explanatory error and export a proxy that throws when used.
    // This gives a clearer runtime error to developers while avoiding an
    // immediate hard crash at module `require` time in some workflows.
    if (logger && typeof logger.error === 'function') {
      logger.error('[supabaseClient] ' + message);
    } else {
      console.error('[supabaseClient] ' + message);
    }

    const handler = {
      get() {
        throw new Error(message);
      },
      apply() {
        throw new Error(message);
      }
    };

    // Export a proxy object that will throw a clear error when any property
    // is accessed. Many modules expect an object with methods like
    // `storage.from(...)` so this makes the failure explicit when used.
    module.exports = new Proxy({}, handler);
  } else {
    const key = supabaseServiceKey || supabaseAnonKey;
    const supabase = createClient(supabaseUrl, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    module.exports = supabase;
  }
}

export default module.exports;
