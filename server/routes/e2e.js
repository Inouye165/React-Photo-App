// E2E-only test login route for Playwright/Cypress
// This route is only enabled in test/dev environments
// Security: This route is blocked in production and only creates test tokens
const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');
const { e2eGateMiddleware } = require('../config/e2eGate');

const router = express.Router();

// Defense-in-depth: even if this router is mounted accidentally,
// keep E2E surfaces disabled unless explicitly enabled.
router.use(e2eGateMiddleware);

// Explicit rate limiting for E2E auth-like endpoints.
// Note: These routes are always disabled in production by the E2E gate.
const isTestEnv = process.env.NODE_ENV === 'test';
const e2eLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Keep tests stable (avoid flakiness), but still satisfy scanners and protect dev usage.
  max: isTestEnv ? 1000 : 30,
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(e2eLimiter);

const config = getConfig();

// POST /api/test/e2e-login
// Sets a valid httpOnly cookie for a test user
// Security note: This endpoint is explicitly blocked in production (line 16)
// and only used for automated E2E testing. The token is stored in an httpOnly
// cookie which is the secure pattern for session management.
router.post('/e2e-login', (req, res) => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'e2e-test',
    role: 'admin',
    email: 'e2e@example.com'
  };
  // Sign a JWT for the test user
  // lgtm[js/clear-text-storage-of-sensitive-data]
  // codeql[js/clear-text-storage-of-sensitive-data] - Token is stored in httpOnly cookie (secure pattern)
    const token = jwt.sign(
      { 
        sub: '11111111-1111-4111-8111-111111111111',
        email: 'e2e@example.com',
        username: 'e2e-test',
        role: 'admin'
      },
      config.jwtSecret,
      { expiresIn: '1h' }
    );  // Set the cookie (same config as /auth/session)
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
  const token = req.cookies?.authToken;
  if (!token) {
    return res.status(401).json({ success: false, error: 'No session cookie' });
  }
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    // Check if this is an E2E test token
    if (decoded.sub === '11111111-1111-4111-8111-111111111111') {
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
