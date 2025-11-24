const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase URL or Key missing. Auth routes may fail.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Factory function to create auth router
 * Handles authentication-related endpoints including cookie-based session management
 */
function createAuthRouter() {
  const router = express.Router();

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

      // MOCK AUTH SUPPORT FOR CI/TESTING
      const mockAuth = String(process.env.MOCK_AUTH || '').trim();
      if (mockAuth === 'true' && token === 'mock-token') {
        // Set cookie for mock auth
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: '/'
        };

        res.cookie('authToken', token, cookieOptions);
        
        return res.json({
          success: true,
          message: 'Session cookie set successfully'
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
      // Security configuration:
      // - httpOnly: prevents JavaScript access (XSS protection)
      // - secure: only sent over HTTPS in production
      // - sameSite: prevents CSRF attacks
      // - maxAge: cookie expires after 24 hours
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/'
      };

      res.cookie('authToken', token, cookieOptions);

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
   */
  router.post('/logout', (req, res) => {
    res.clearCookie('authToken', { path: '/' });
    return res.json({
      success: true,
      message: 'Session cookie cleared'
    });
  });

  return router;
}

module.exports = createAuthRouter;
