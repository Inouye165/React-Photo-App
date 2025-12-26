function registerMiddleware(app) {
  if (!app) throw new Error('app is required');

  const express = require('express');
  const cors = require('cors');
  const cookieParser = require('cookie-parser');
  const csurf = require('csurf');

  const { configureSecurity, validateRequest } = require('../middleware/security');

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
  app.use(
    cors({
      origin: function (origin, callback) {
        const isAllowed = !origin || allowedOrigins.includes(origin);
        if (process.env.NODE_ENV !== 'test' && process.env.DEBUG_CORS === 'true') {
          const logger = require('../logger');
          logger.info('[CORS DEBUG]', { origin, isAllowed, allowedOrigins });
        }
        if (isAllowed) {
          return callback(null, origin);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      maxAge: Number(process.env.CORS_MAX_AGE_SECONDS || 600),
      optionsSuccessStatus: 204,
    })
  );

  // Configure security middleware after CORS so security headers are
  // applied to responses that already include CORS headers.
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
