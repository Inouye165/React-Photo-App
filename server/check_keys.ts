import './env';

console.log('SUPABASE_URL:', Boolean(process.env.SUPABASE_URL));
console.log('SUPABASE_ANON_KEY:', Boolean(process.env.SUPABASE_ANON_KEY));
console.log('SUPABASE_SERVICE_ROLE_KEY:', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));