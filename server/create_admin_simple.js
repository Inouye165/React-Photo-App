// DEPRECATED: This script created admin users in the local 'users' table
// which has been removed in favor of Supabase Auth.
//
// To create admin users, use the Supabase Dashboard or Admin API:
// https://supabase.com/docs/guides/auth/managing-user-data
//
// Example using Supabase Admin API:
// const { createClient } = require('@supabase/supabase-js');
// const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// await supabase.auth.admin.createUser({
//   email: 'admin@example.com',
//   password: 'secure_password',
//   email_confirm: true,
//   user_metadata: { role: 'admin' }
// });

require('./env');
const logger = require('./logger');

logger.warn('This script is deprecated. Use Supabase Auth Admin API to create users.');
logger.warn('See: https://supabase.com/docs/reference/javascript/auth-admin-createuser');
process.exit(1);