const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const { getAllowedOrigins } = require('../config/allowedOrigins');
const { COOKIE_NAME, getAuthCookieOptions, getClearCookieOptions } = require('../config/cookieConfig');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase URL or Key missing. Auth routes may fail.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Rate limiting for authentication endpoints
// More strict than general API to prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 auth requests per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Origin verification middleware for CSRF protection
 * Validates that requests come from allowed origins
 */
function verifyOrigin(req, res, next) {
  // Safe methods don't need CSRF protection
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Get origin from header or referer
  let origin = req.headers['origin'];
  if (!origin && req.headers['referer']) {
    try {
      const url = new URL(req.headers['referer']);
      origin = url.origin;
    } catch {
      origin = null;
    }
  }

  // Require origin for state-changing requests
  if (!origin) {
    return res.status(403).json({
      success: false,
      error: 'Origin header required for authentication'
    });
  }

  // Verify origin is allowed
  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      error: 'Origin not allowed'
    });
  }

  next();
}

/**
 * Factory function to create auth router
 * Handles authentication-related endpoints including cookie-based session management
 */
function createAuthRouter({ db: _db } = {}) {
  const router = express.Router();

  // Apply rate limiting and origin verification to all auth routes
  router.use(authLimiter);
  router.use(verifyOrigin);

  /**
   * POST /api/auth/session
   * Accepts a valid Supabase JWT in Authorization header
   * Verifies the token and sets an httpOnly cookie for secure image access
   * 
   * This endpoint bridges Supabase client-side auth with server-side cookie-based auth
   * enabling secure <img> tag requests without query parameter token leakage
   */
  router.post('/session', async (req, res) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      }

      // Verify token using Supabase Auth
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(403).json({
          success: false,
          error: 'Invalid token'
        });
      }

      // Token is valid - set httpOnly cookie
      // Security configuration centralized in config/cookieConfig.js:
      // - httpOnly: prevents JavaScript access (XSS protection)
      // - secure: true in production OR when SameSite=None (browser requirement)
      // - sameSite: configurable via COOKIE_SAME_SITE env var for cross-origin
      // - maxAge: cookie expires after 24 hours
      
      const cookieOptions = getAuthCookieOptions();

      res.cookie(COOKIE_NAME, token, cookieOptions);

      return res.json({
        success: true,
        message: 'Session cookie set successfully',
        user: {
          id: user.id,
          email: user.email
        }
      });
    } catch (err) {
      console.error('Session endpoint error:', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Clears the authToken cookie
   * 
   * IMPORTANT: clearCookie options must match the options used when setting
   * the cookie (same secure, sameSite, path) otherwise browsers won't clear it.
   */
  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, getClearCookieOptions());
    return res.json({
      success: true,
      message: 'Session cookie cleared'
    });
  });

  return router;
}

module.exports = createAuthRouter;
