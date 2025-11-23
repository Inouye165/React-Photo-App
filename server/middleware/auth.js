const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase URL or Key missing. Auth middleware may fail.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Middleware to verify Supabase JWT token and authenticate users
 */
async function authenticateToken(req, res, next) {
  // Require token from Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  // MOCK AUTH SUPPORT FOR CI/TESTING
  const mockAuth = String(process.env.MOCK_AUTH || '').trim();
  if (mockAuth === 'true') {
    if (token === 'mock-token') {
      req.user = {
        id: 'test-user-id',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user'
      };
      return next();
    }
  }

  try {
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
      role: user.user_metadata?.role || 'user'
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