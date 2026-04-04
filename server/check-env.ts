import './env';
import logger = require('./logger');

const needed = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
] as const;

logger.info('Checking Supabase-related environment variables (server/.env)');
const missing: string[] = [];

for (const key of needed) {
  const value = process.env[key];
  logger.info(` - ${key}: ${value ? 'present' : 'MISSING'}`);
  if (!value) {
    missing.push(key);
  }
}

if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  missing.push('SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');
}

if (missing.length > 0) {
  logger.error(`\nMissing required variables: ${Array.from(new Set(missing)).join(', ')}`);
  logger.error('Add them to server/.env (or export into the environment). For server-only operations, SUPABASE_SERVICE_ROLE_KEY is an acceptable alternative to SUPABASE_ANON_KEY.');
  process.exit(1);
}

logger.info('\nAll required Supabase variables appear present.');