const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const { getAllowedOrigins } = require('../config/allowedOrigins');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase URL or Key missing. Image auth may fail.');
}

if (!JWT_SECRET) {
  console.warn('JWT_SECRET missing. Local token verification will fail.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.get('Origin');
  const originIsAllowed = !requestOrigin || allowedOrigins.includes(requestOrigin);
  const fallbackOrigin = allowedOrigins.find(origin => /5173/.test(origin)) || allowedOrigins[0] || null;
  const originToSet = requestOrigin || fallbackOrigin;

  // Always set CORP header for images to allow cross-origin loading
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');

  if (!originIsAllowed) {
    return res.status(403).json({
      success: false,
      error: 'Origin not allowed for image access'
    });
  }

  if (originToSet) {
    res.header('Access-Control-Allow-Origin', originToSet);
    if (requestOrigin) {
      res.header('Vary', 'Origin');
    }
  }

  res.header('Access-Control-Allow-Credentials', 'true');
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
    // Verify token locally using JWT_SECRET if available (faster)
    if (JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = { id: decoded.sub, ...decoded }; // Map standard claims
        req.authSource = authSource;
        return next();
      } catch {
        // Token might be a Supabase session token not signed by our JWT_SECRET
        // Fall through to Supabase verification
      }
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