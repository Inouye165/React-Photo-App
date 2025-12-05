const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Initialize Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase URL or Key missing. Auth middleware may fail.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Middleware to verify Supabase JWT token and authenticate users
 * 
 * SECURITY: Token is read from httpOnly cookie (primary) or Authorization header (fallback)
 * This prevents token leakage via browser history, proxy logs, and referer headers
 * Query parameter tokens are NOT supported to prevent security vulnerabilities
 */
async function authenticateToken(req, res, next) {
  let token = null;

  // 1. Primary: Check httpOnly cookie (secure method set by /api/auth/session)
  if (req.cookies && req.cookies.authToken) {
    token = req.cookies.authToken;
  }

  // 2. Fallback: Check Authorization header (for API clients, testing)
  if (!token) {
    const authHeader = req.headers.authorization;
    token = authHeader && authHeader.split(' ')[1];
  }

  // SECURITY: Query parameter tokens are NOT supported
  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  try {
    // 0. Check for E2E test token (only in non-production)
    if (process.env.NODE_ENV !== 'production') {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.sub === '11111111-1111-4111-8111-111111111111') {
          req.user = {
            id: decoded.sub,
            email: decoded.email,
            username: decoded.username,
            role: decoded.role
          };
          return next();
        }
      } catch {
        // Not a valid E2E token, continue to Supabase check
      }
    }

    // Verify token using Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }

    // Map Supabase user to app user structure
    req.user = {
      id: user.id,
      email: user.email,
      // Use metadata for username/role if available, otherwise fallback
      username: user.user_metadata?.username || user.email.split('@')[0],
      // SECURITY: Use app_metadata for role (server-controlled, not client-writable)
      // app_metadata can only be modified via Service Role Key
      role: user.app_metadata?.role || 'user'
    };

    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Middleware to require specific roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }
    
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole
};