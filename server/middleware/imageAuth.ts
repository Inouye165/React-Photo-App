const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const { resolveAllowedOrigin, isOriginAllowed } = require('../config/allowedOrigins');
const { getConfig } = require('../config/env');

// Centralized config:
// - Production fails fast if required env is missing.
// - Non-prod provides safe defaults.
const config = getConfig();
const supabase = createClient(config.supabase.url, config.supabase.anonKey);

/**
 * Middleware to authenticate image requests
 * 
 * SECURITY ARCHITECTURE (Bearer Token Auth - Primary):
 * - Token is read from Authorization header as "Bearer <token>" (PRIMARY)
 * - This is the recommended approach for:
 *   - iOS/Mobile Safari compatibility (no ITP cookie blocking)
 *   - Modern stateless API patterns
 *   - Cross-origin deployments (frontend on Vercel, backend on Railway)
 * 
 * DEPRECATED: Cookie-based auth (fallback during transition)
 * - httpOnly cookie is checked as FALLBACK only
 * - Will be removed in a future version
 * - New clients should use Bearer token auth exclusively via fetchProtectedBlobUrl
 * 
 * Query parameter authentication is NOT supported (security risk)
 */
async function authenticateImageRequest(req, res, next) {
  const requestOrigin = req.get('Origin');

  // SECURITY: Use centralized origin resolution - never hardcode localhost:5173
  // This ensures CORS headers match the incoming request origin when allowed
  const allowedOrigins = require('../config/allowedOrigins').getAllowedOrigins();
  const resolvedOrigin = resolveAllowedOrigin(requestOrigin);
  // Use centralized allowlist check which permits requests with no Origin (server-to-server)
  const originIsAllowed = isOriginAllowed(requestOrigin);

  // Always set CORP header for images to allow cross-origin loading
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');

  if (process.env.NODE_ENV !== 'test') {
    console.log('[IMAGEAUTH CORS DEBUG]', {
      requestOrigin: req.get('origin') || req.get('Origin'),
      resolvedOrigin,
      allowed: originIsAllowed,
      allowedOrigins,
      path: req.path
    });
  }

  if (!originIsAllowed) {
    return res.status(403).json({
      success: false,
      error: 'Origin not allowed for image access'
    });
  }

  // SECURITY: Only set Access-Control-Allow-Origin if we have a valid, non-"null" origin.
  // This protects against misconfigurations where "null" could be treated as allowed.
  // Setting Access-Control-Allow-Origin to "null" with credentials is a security risk (CWE-942).
  // Defense-in-depth: even if resolveAllowedOrigin is misconfigured, this guard prevents the issue.
  // CodeQL/OWASP: Only set credentials header if also setting a valid allowlisted origin.
  // This prevents CORS credential leaks (CWE-942).
  // Only set CORS origin and credentials when it's safe.
  // Requirements:
  // - There must be an incoming Origin header (browser-initiated request).
  // - The origin must be allowlisted via centralized check (`isOriginAllowed`).
  // - The resolved origin must be a concrete origin (not '*' or 'null').
  // - Only set `Access-Control-Allow-Credentials` when the computed allowed
  //   origin exactly matches the incoming `Origin` header to prevent header
  //   spoofing and credential leaks (defense-in-depth for CWE-942).
  if (requestOrigin && originIsAllowed && resolvedOrigin && resolvedOrigin !== 'null' && resolvedOrigin !== '*') {
    // If the resolved allowlisted origin exactly matches the request Origin,
    // it is safe to enable credentials. Otherwise, set the origin header
    // without credentials as a conservative fallback.
    res.header('Access-Control-Allow-Origin', resolvedOrigin);
    res.header('Vary', 'Origin');
    if (resolvedOrigin === requestOrigin) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let token = null;
  let authSource = null;

  // 1. PRIMARY: Check Authorization header (Bearer token)
  // This is the recommended approach for modern clients
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7); // Remove 'Bearer ' prefix
    authSource = 'bearer';
  }

  // 2. DEPRECATED FALLBACK: Check httpOnly cookie (legacy support)
  // This will be removed in a future version
  if (!token && req.cookies && req.cookies.authToken) {
    token = req.cookies.authToken;
    authSource = 'cookie';
    // Log deprecation warning in development (not in production to avoid log spam)
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.debug('[imageAuth] Cookie-based auth is deprecated. Please use Authorization: Bearer <token> header.');
    }
  }

  // SECURITY: Query parameter authentication is NOT supported
  // to prevent token leakage via browser history, logs, and referer headers
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required for image access' 
    });
  }

  try {
    // Verify token locally using server JWT secret (faster)
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.user = { id: decoded.sub, ...decoded }; // Map standard claims
      req.authSource = authSource;
      return next();
    } catch {
      // Token might be a Supabase session token not signed by our server JWT secret
      // Fall through to Supabase verification
    }

    // Fallback to Supabase API verification (slower)
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }

    req.user = user;
    req.authSource = authSource;
    next();
  } catch (err) {
    // SECURITY: Never log the actual token or include it in error responses
    console.error('Image auth error:', err.message);
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
}

module.exports = {
  authenticateImageRequest
};

export {};