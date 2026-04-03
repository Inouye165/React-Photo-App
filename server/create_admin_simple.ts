import './env';
import logger = require('./logger');

logger.warn('This script is deprecated. Use Supabase Auth Admin API to create users.');
logger.warn('See: https://supabase.com/docs/reference/javascript/auth-admin-createuser');
process.exit(1);