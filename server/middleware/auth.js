const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');
const { isE2EEnabled } = require('../config/e2eGate');

// Initialize Supabase client
// In production, missing SUPABASE_* or JWT_SECRET will fail fast via config validation.
const config = getConfig();
const supabase = createClient(config.supabase.url, config.supabase.anonKey);

/**
 * Middleware to verify Supabase JWT token and authenticate users
 * 
 * SECURITY ARCHITECTURE (Stateless JWT Bearer Token):
 * - Token MUST be provided in Authorization header as "Bearer <token>"
 * - This approach provides:
 *   - Stateless authentication (no server-side session storage)
 *   - CSRF immunity (tokens not sent automatically like cookies)
 *   - iOS/Mobile Safari compatibility (no ITP cookie blocking)
 *   - Modern API patterns (standard HTTP Authorization header)
 *   - Cross-origin deployments (no SameSite cookie issues)
 * 
 * SECURITY NOTES:
 * - Cookies are NOT supported (eliminates cookie/session split-brain issues)
 * - Query parameter tokens are NOT supported (security risk - logged in URLs)
 * - Token validation is handled by Supabase Auth (getUser API)
 * - Tokens are NEVER logged or exposed in error messages
 */
async function authenticateToken(req, res, next) {
  // REQUIRED: Extract Bearer token from Authorization header
  // This is the ONLY supported authentication method
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authorization header with Bearer token required' 
    });
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    });
  }

  try {
    // 0. Check for E2E test token (only in non-production)
    if (isE2EEnabled()) {
      // Allow header-based bypass for E2E tests (avoids cookie issues)
      if (req.headers['x-e2e-user-id'] === '11111111-1111-4111-8111-111111111111') {
        req.user = {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'e2e@example.com',
          username: 'e2e-test',
          role: 'admin'
        };
        req.authSource = 'e2e-header';
        return next();
      }

      try {
        const decoded = jwt.verify(token, config.jwtSecret);
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
      if (process.env.AUTH_DEBUG_LOGS) {
        const origin = req.headers.origin;
        const ua = req.headers['user-agent'];
        const hasAuthHeader = Boolean(req.headers.authorization);
        const tokenLen = typeof token === 'string' ? token.length : 0;
        const backendSupabaseUrl = config?.supabase?.url || process.env.SUPABASE_URL;

        const tokenMeta = (() => {
          try {
            if (typeof token !== 'string') return { parse: 'failed' };
            const parts = token.split('.');
            if (parts.length !== 3) return { parse: 'failed' };

            const payloadB64Url = parts[1];
            const payloadB64 = payloadB64Url.replace(/-/g, '+').replace(/_/g, '/');
            const padded = payloadB64.padEnd(Math.ceil(payloadB64.length / 4) * 4, '=');
            const payloadJson = Buffer.from(padded, 'base64').toString('utf8');
            const payload = JSON.parse(payloadJson);

            return {
              iss: payload?.iss,
              aud: payload?.aud,
              sub: payload?.sub,
              exp: payload?.exp
            };
          } catch {
            return { parse: 'failed' };
          }
        })();

        console.warn('[auth] Invalid token', {
          origin,
          ua,
          hasAuthHeader,
          tokenLen,
          tokenMeta,
          backendSupabaseUrl
        });
      }
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
    req.authSource = 'bearer';

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