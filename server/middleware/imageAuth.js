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
 * Checks for token in Authorization header OR query parameter
 * Sets CORS headers for cross-origin image requests
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

  // 1. Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Check Query Parameter (fallback for <img> tags)
  if (!token && req.query.token) {
    token = req.query.token;
  }

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
    next();
  } catch (err) {
    console.error('Image auth error:', err);
    return res.status(403).json({ success: false, error: 'Invalid token' });
  }
}

module.exports = {
  authenticateImageRequest
};