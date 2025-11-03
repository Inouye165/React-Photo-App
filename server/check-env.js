require('./env');
const logger = require('./logger');

const needed = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

logger.info('Checking Supabase-related environment variables (server/.env)');
const missing = [];
needed.forEach((k) => {
  const v = process.env[k];
  logger.info(` - ${k}: ${v ? 'present' : 'MISSING'}`);
  if (!v) missing.push(k);
});

if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');

if (missing.length) {
  logger.error('\nMissing required variables: ' + [...new Set(missing)].join(', '));
  logger.error('Add them to server/.env (or export into the environment). For server-only operations, SUPABASE_SERVICE_ROLE_KEY is an acceptable alternative to SUPABASE_ANON_KEY.');
  process.exit(1);
}

logger.info('\nAll required Supabase variables appear present.');
process.exit(0);
