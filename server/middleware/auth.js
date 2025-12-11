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
 * SECURITY ARCHITECTURE (Bearer Token Auth - Primary):
 * - Token is read from Authorization header as "Bearer <token>" (PRIMARY)
 * - This is the recommended approach for:
 *   - iOS/Mobile Safari compatibility (no ITP cookie blocking)
 *   - Modern stateless API patterns
 *   - Cross-origin deployments (frontend on Vercel, backend on Railway)
 * 
 * DEPRECATED: Cookie-based auth (fallback during transition)
 * - httpOnly cookie is checked as FALLBACK only
 * - Will be removed in a future version
 * - New clients should use Bearer token auth exclusively
 * 
 * Query parameter tokens are NOT supported (security risk)
 */
async function authenticateToken(req, res, next) {
  let token = null;
  let authSource = null;

  // 1. PRIMARY: Check Authorization header (Bearer token)
  // This is the recommended approach for modern clients
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7); // Remove 'Bearer ' prefix
    authSource = 'bearer';
  }

  // 2. DEPRECATED FALLBACK: Check httpOnly cookie (legacy support)
  // This will be removed in a future version
  if (!token && req.cookies && req.cookies.authToken) {
    token = req.cookies.authToken;
    authSource = 'cookie';
    // Log deprecation warning in development (not in production to avoid log spam)
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.debug('[auth] Cookie-based auth is deprecated. Please use Authorization: Bearer <token> header.');
    }
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
          req.authSource = 'e2e-test';
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
    req.authSource = authSource;

    next();
  } catch (err) {
    // SECURITY: Never log the actual token or include it in error responses
    console.error('Auth error:', err.message);
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