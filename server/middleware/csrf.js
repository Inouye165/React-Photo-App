// CSRF protection middleware using Strict Origin Verification
const { getAllowedOrigins } = require('../config/allowedOrigins');

function parseOriginFromReferer(referer) {
  try {
    const url = new URL(referer);
    return url.origin;
  } catch {
    return null;
  }
}

function csrfProtection(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  let origin = req.headers['origin'];
  if (!origin && req.headers['referer']) {
    origin = parseOriginFromReferer(req.headers['referer']);
  }

  if (!origin) {
    return res.status(403).json({ error: 'Origin header required' });
  }

  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'CSRF: Origin not allowed' });
  }

  next();
}

module.exports = { csrfProtection };