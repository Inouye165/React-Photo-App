const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const needed = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

console.log('Checking Supabase-related environment variables (server/.env)');
const missing = [];
needed.forEach((k) => {
  const v = process.env[k];
  console.log(` - ${k}: ${v ? 'present' : 'MISSING'}`);
  if (!v) missing.push(k);
});

if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY');

if (missing.length) {
  console.error('\nMissing required variables: ' + [...new Set(missing)].join(', '));
  console.error('Add them to server/.env (or export into the environment). For server-only operations, SUPABASE_SERVICE_ROLE_KEY is an acceptable alternative to SUPABASE_ANON_KEY.');
  process.exit(1);
}

console.log('\nAll required Supabase variables appear present.');
process.exit(0);
