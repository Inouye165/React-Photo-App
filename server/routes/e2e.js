// E2E-only test login route for Playwright/Cypress
// This route is only enabled in test/dev environments
// Security: This route is blocked in production and only creates test tokens
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// POST /api/test/e2e-login
// Sets a valid httpOnly cookie for a test user
// Security note: This endpoint is explicitly blocked in production (line 16)
// and only used for automated E2E testing. The token is stored in an httpOnly
// cookie which is the secure pattern for session management.
router.post('/e2e-login', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: 'E2E login not allowed in production' });
  }
  const user = {
    id: 'e2e-test-user',
    username: 'e2e-test',
    role: 'admin',
    email: 'e2e@example.com'
  };
  // Sign a JWT for the test user
  // lgtm[js/clear-text-storage-of-sensitive-data]
  // codeql[js/clear-text-storage-of-sensitive-data] - Token is stored in httpOnly cookie (secure pattern)
  const token = jwt.sign({
    sub: user.id,
    username: user.username,
    role: user.role,
    email: user.email
  }, JWT_SECRET, { expiresIn: '24h' });

  // Set the cookie (same config as /auth/session)
  // The httpOnly flag prevents JavaScript access, making this secure storage
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: false, // Set to true if running E2E over HTTPS
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  });
  res.json({ success: true, user });
});

// GET /api/test/e2e-verify
// Verifies the E2E test session cookie and returns the user if valid
router.get('/e2e-verify', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: 'E2E verify not allowed in production' });
  }
  
  const token = req.cookies?.authToken;
  if (!token) {
    return res.status(401).json({ success: false, error: 'No session cookie' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Check if this is an E2E test token
    if (decoded.sub === 'e2e-test-user') {
      return res.json({
        success: true,
        user: {
          id: decoded.sub,
          username: decoded.username,
          role: decoded.role,
          email: decoded.email
        }
      });
    }
    return res.status(401).json({ success: false, error: 'Not an E2E session' });
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

module.exports = router;
