const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/**
 * Configure security middleware
 */
function configureSecurity(app) {
  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "http://localhost:3001"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "http://localhost:3001"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow image loading from same origin
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow cross-origin resources
  }));

  // General rate limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    }
  });

  // Upload rate limiting
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit uploads per IP
    message: {
      success: false,
      error: 'Too many upload attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // API rate limiting (more strict for API endpoints)
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit API calls per IP
    message: {
      success: false,
      error: 'Too many API requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply general rate limiting to all routes
  app.use(generalLimiter);

  // Apply stricter rate limiting to upload routes
  app.use('/upload', uploadLimiter);

  // Apply API rate limiting to API routes
  app.use('/api', apiLimiter);
  app.use('/photos', apiLimiter);

  return {
    uploadLimiter,
    apiLimiter,
    generalLimiter
  };
}

/**
 * Security middleware to validate requests
 */
function validateRequest(req, res, next) {
  // Basic input validation and sanitization
  
  // Check for suspicious patterns in URL
  const suspiciousPatterns = [
    /\.\.\//g, // Directory traversal
    /<script/gi, // XSS attempts
    /%3Cscript/gi, // URL-encoded XSS attempts
    /union.*select/gi, // SQL injection attempts
    /exec\(/gi, // Code execution attempts
  ];

  const fullUrl = req.originalUrl || req.url;
  // Also check the decoded URL
  let decodedUrl = '';
  try {
    decodedUrl = decodeURIComponent(fullUrl);
  } catch {
    // If decoding fails, stick with original URL
    decodedUrl = fullUrl;
  }

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(fullUrl) || pattern.test(decodedUrl)) {
      console.warn(`Suspicious request detected from ${req.ip}: ${fullUrl}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid request'
      });
    }
  }

  // Validate content type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    if (contentType && !contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
      // Allow some other content types for specific endpoints
      const allowedPaths = ['/upload'];
      if (!allowedPaths.some(path => req.path.startsWith(path))) {
        return res.status(415).json({
          success: false,
          error: 'Unsupported content type'
        });
      }
    }
  }

  next();
}

/**
 * Error handling middleware for security-related errors
 */
function securityErrorHandler(err, req, res, next) {
  // Log security-related errors
  if (err.status === 401 || err.status === 403) {
    console.warn(`Security error from ${req.ip}: ${err.message}`);
  }

  // Don't expose internal error details
  if (err.status >= 500) {
    console.error('Internal security error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }

  next(err);
}

module.exports = {
  configureSecurity,
  validateRequest,
  securityErrorHandler
};