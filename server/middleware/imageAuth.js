const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

/**
 * Middleware to authenticate image requests
 * Checks for token in Authorization header, query parameter, or cookie
 * Sets CORS headers for cross-origin image requests
 */
function authenticateImageRequest(req, res, next) {
  // Set CORS headers for image requests
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let token = null;

  // Try to get token from Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Explicitly deny token in query parameters. Using tokens in URLs
  // is insecure (can leak via referer, logs, browser history).
  if (req.query && req.query.token) {
    return res.status(403).json({
      success: false,
      error: 'Token in query parameter is not allowed for image access. Use httpOnly cookie or Authorization header.'
    });
  }

  // If no token in query, try cookie
  if (!token && req.cookies && req.cookies.authToken) {
    token = req.cookies.authToken;
  }

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required for image access' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false, 
          error: 'Token expired' 
        });
      }
      return res.status(403).json({ 
        success: false, 
        error: 'Invalid token' 
      });
    }
    
    req.user = user;
    next();
  });
}

module.exports = {
  authenticateImageRequest
};