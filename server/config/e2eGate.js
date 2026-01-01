// server/config/e2eGate.js
// Centralized E2E/test-only feature gate.
//
// Security goals:
// - In production, E2E surfaces are ALWAYS disabled regardless of flags.
// - In non-production, E2E surfaces are disabled by default unless explicitly enabled.
// - Responses must not reveal environment details.

const { getNodeEnv } = require('./env.validate');

function isE2EEnabled() {
  const nodeEnv = getNodeEnv();
  // Security hardening:
  // - Never enable E2E surfaces in production.
  // - In all other environments, keep them OFF by default and require an explicit flag.
  //
  // Practical note:
  // - Playwright starts the backend via `npm start`, which runs in development mode
  //   (and the server intentionally does not listen when NODE_ENV=test).
  // - Therefore we allow E2E routes in non-production when explicitly enabled.
  if (nodeEnv === 'production') return false;
  return process.env.E2E_ROUTES_ENABLED === 'true';
}

function e2eGateMiddleware(req, res, next) {
  if (!isE2EEnabled()) {
    return res.status(404).json({ success: false, error: 'Not found' });
  }
  return next();
}

module.exports = {
  isE2EEnabled,
  e2eGateMiddleware
};
