function registerMiddleware(app) {
  if (!app) throw new Error('app is required');

  const express = require('express');
  const cors = require('cors');
  const cookieParser = require('cookie-parser');
  const csurf = require('csurf');

  const { configureSecurity, validateRequest } = require('../middleware/security');
  const { requestIdMiddleware } = require('../middleware/requestId');

  // Configure CORS origins early so preflight (OPTIONS) and error responses
  // include the appropriate Access-Control-Allow-* headers before any
  // validation or authentication middleware runs.
  const { getAllowedOrigins } = require('../config/allowedOrigins');
  const allowedOrigins = getAllowedOrigins();

  // --- CORS Startup Logging ---
  // Print allowed origins at startup (non-prod or DEBUG_CORS=true)
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_CORS === 'true') {
    const logger = require('../logger');
    logger.info(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
  }

  // --- Centralized CORS Middleware ---
  const corsOptions = {
    origin: function (origin, callback) {
      const isAllowed = !origin || allowedOrigins.includes(origin);
      if (process.env.NODE_ENV !== 'test' && process.env.DEBUG_CORS === 'true') {
        const logger = require('../logger');
        logger.info('[CORS DEBUG]', { origin, isAllowed, allowedOrigins });
      }
      if (isAllowed) {
        // If there is no Origin header (same-origin, curl, server-to-server), allow.
        // `cors` treats `true` as "reflect request origin".
        return callback(null, origin || true);
      }
      const err = new Error('Not allowed by CORS');
      err.code = 'CORS_NOT_ALLOWED';
      return callback(err);
    },
    credentials: true,
    maxAge: Number(process.env.CORS_MAX_AGE_SECONDS || 600),
    optionsSuccessStatus: 204,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  };

  // Ensure preflight requests succeed before any auth/validation middleware.
  app.options('*', cors(corsOptions));
  app.use(cors(corsOptions));

  // Convert CORS denials into a clean 403 (avoid leaking internal error details).
  app.use((err, req, res, next) => {
    if (err && (err.code === 'CORS_NOT_ALLOWED' || err.message === 'Not allowed by CORS')) {
      return res.status(403).json({ success: false, error: 'Origin not allowed' });
    }
    return next(err);
  });

  // Configure security middleware after CORS so security headers are
  // applied to responses that already include CORS headers.
  // Establish a sanitized request ID early for logging/trace correlation.
  app.use(requestIdMiddleware);
  configureSecurity(app);

  // Cookie parser for secure httpOnly cookie authentication
  app.use(cookieParser());

  // CSRF protection (cookie mode): mount after cookieParser and before routes.
  // Applies to unsafe methods only (POST/PUT/PATCH/DELETE); safe methods are ignored.
  //
  // Production note (cross-origin frontends like Vercel -> Railway):
  // - Browsers will not include SameSite=Lax cookies on cross-site fetch() POST requests.
  // - csurf cookie mode requires the secret cookie to round-trip, otherwise requests fail
  //   with EBADCSRFTOKEN (403).
  // - SameSite=None is required for cross-site cookie transmission, and Secure=true is
  //   mandatory (browsers reject SameSite=None without Secure).
  const isProduction = process.env.NODE_ENV === 'production';
  const csrfCookieSameSite = isProduction ? 'none' : 'lax';
  const csrfCookieSecure = csrfCookieSameSite === 'none' ? true : isProduction;
  // In development we disable csurf to avoid EBADCSRFTOKEN during local
  // dev flows where the frontend dev server and backend may not round-trip
  // the secret cookie. Enable csurf for all other environments.
  if (process.env.NODE_ENV === 'development') {
    const logger = require('../logger');
    logger.info('[CSRF] csurf disabled in development (NODE_ENV=development)');
  } else {
    app.use(
      csurf({
        cookie: {
          key: 'csrfSecret',
          httpOnly: true,
          sameSite: csrfCookieSameSite,
          secure: csrfCookieSecure,
          path: '/',
        },
      })
    );
  }

  // Add request validation middleware
  app.use(validateRequest);

  // Limit request body size to mitigate DoS from huge payloads
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  // Observability: lightweight Prometheus-style HTTP metrics
  const metricsHttpMiddleware = require('../middleware/metricsHttp');
  app.use(metricsHttpMiddleware);
}

module.exports = {
  registerMiddleware,
};
