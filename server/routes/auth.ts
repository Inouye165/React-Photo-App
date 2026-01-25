const express = require('express');
const rateLimit = require('express-rate-limit');
const { getAllowedOrigins } = require('../config/allowedOrigins');
const { getRateLimitStore } = require('../middleware/rateLimitStore');

// Rate limiting for authentication endpoints
// Strict limit to prevent brute force attacks on login/session endpoints
// In test environment, use higher limit to avoid test interference
const isTestEnv = process.env.NODE_ENV === 'test';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTestEnv ? 1000 : 10, // 10 in production, higher in tests to avoid interference
  store: getRateLimitStore(),
  message: {
    success: false,
    error: 'Too many login attempts, please try again later.'
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
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
function createAuthRouter({ db: _db }: { db?: unknown } = {}) {
  const router = express.Router();

  // Apply rate limiting and origin verification to all auth routes
  router.use(authLimiter);
  router.use(verifyOrigin);

  /**
   * POST /api/auth/session
   * DEPRECATED: This endpoint is no longer needed for Bearer token authentication.
   * 
   * Previously used to bridge Supabase client-side auth with server-side cookie-based auth.
   * Now that the application uses exclusively Bearer token authentication, this endpoint
   * is maintained only for backward compatibility and returns success without side effects.
   * 
   * Migration Note: Update your frontend to use Bearer tokens directly:
   *   Authorization: Bearer <token>
   * 
   * This endpoint will be removed in a future version.
   */
  router.post('/session', async (req, res) => {
    // Log deprecation warning in development
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.warn('[DEPRECATED] /api/auth/session endpoint is deprecated. Use Bearer token authentication directly.');
    }

    // Return success for backward compatibility (no-op)
    return res.json({
      success: true,
      deprecated: true,
      message: 'Session endpoint deprecated. Use Authorization: Bearer <token> header for all requests.'
    });
  });

  /**
   * POST /api/auth/logout
   * DEPRECATED: This endpoint is no longer needed for Bearer token authentication.
   * 
   * Previously used to clear httpOnly cookies. With Bearer token authentication,
   * logout is handled entirely on the client side by discarding the token.
   * 
   * Migration Note: To log out, simply:
   *   1. Call supabase.auth.signOut() on the frontend
   *   2. Remove the token from your frontend state/storage
   * 
   * This endpoint will be removed in a future version.
   */
  router.post('/logout', (req, res) => {
    // Log deprecation warning in development
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.warn('[DEPRECATED] /api/auth/logout endpoint is deprecated. Handle logout on the client side.');
    }

    // Return success for backward compatibility (no-op)
    return res.json({
      success: true,
      deprecated: true,
      message: 'Logout endpoint deprecated. Handle logout client-side by calling supabase.auth.signOut().'
    });
  });

  return router;
}

module.exports = createAuthRouter;

export {};
