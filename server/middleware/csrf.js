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

  // Double-submit cookie pattern: check x-csrf-token header matches csrfToken cookie
  const csrfHeader = req.headers['x-csrf-token'];
  const csrfCookie = req.cookies ? req.cookies['csrfToken'] : undefined;
  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return res.status(403).json({ error: 'CSRF token mismatch or missing' });
  }

  next();
}

module.exports = { csrfProtection };