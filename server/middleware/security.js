const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('../logger');

/**
 * Configure security middleware
 */
function configureSecurity(app) {
  /**
   * Environment-aware Content Security Policy (CSP) for Helmet.
   * - Production: strict CSP (no 'unsafe-inline', no localhost, frame-ancestors 'none').
   * - Dev/Test: minimal allowances for DX ('unsafe-inline', localhost for HMR, etc.).
   * Rationale: Prevent XSS and framing in production, but avoid breaking dev workflows.
   */
  const isProd = process.env.NODE_ENV === 'production';
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleapis.com',
          'https://*.gstatic.com',
          'https://*.ggpht.com',
          'https://*.googleusercontent.com',
          ...(isProd ? [] : ['http://localhost:3001', 'http://localhost:5173'])
        ],
        connectSrc: [
          "'self'",
          'https://*.googleapis.com',
          'https://*.gstatic.com',
          'https://*.google.com',
          ...(isProd ? [] : ['http://localhost:3001', 'http://localhost:5173'])
        ],
        scriptSrc: [
          "'self'",
          "https://*.googleapis.com",
          "https://*.gstatic.com",
          ...(isProd ? [] : ["'unsafe-inline'", "'unsafe-eval'"])
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://*.googleapis.com",
          "https://fonts.googleapis.com"
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameAncestors: [isProd ? "'none'" : "'self'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' }, // Explicit for clarity
    hsts: isProd,
  }));

  // General rate limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // Limit each IP to 2000 requests per windowMs
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
    max: 100, // Limit uploads per IP
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
    max: 1000, // Limit API calls per IP
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
  logger.warn(`Security error from ${req.ip}: ${err.message}`);
  }

  // Don't expose internal error details
  if (err.status >= 500) {
  logger.error('Internal security error:', err);
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