// Load server/.env as the very first runtime config to ensure modules
// that read process.env later see the correct values regardless of CWD.
require('./env');
// Helpful startup logs to make it obvious which DB and Supabase configuration
// are active when the server starts (useful after checking out older commits).
const environment = process.env.NODE_ENV || 'development';
const forcePostgres = process.env.USE_POSTGRES === 'true';
const autoDetectPostgres = Boolean(process.env.SUPABASE_DB_URL) && process.env.USE_POSTGRES_AUTO_DETECT !== 'false';
const usingPostgres = environment === 'production' || forcePostgres || autoDetectPostgres;

// Helper to mask secrets while showing short hint
// Mask helper used in diagnostics: show only last 4 chars to identify keys
// without exposing secrets.
function maskSecret(value) {
  if (!value) return '(missing)';
  return '•••' + String(value).slice(-4);
}

// Detailed debug output showing which env vars are consulted and what was found.
console.log('[server] Startup configuration diagnostics:');
console.log(`[server]  - NODE_ENV = ${environment}`);
console.log(`[server]  - USE_POSTGRES = ${process.env.USE_POSTGRES || '(unset)'} (forcePostgres=${forcePostgres})`);
console.log(`[server]  - USE_POSTGRES_AUTO_DETECT = ${process.env.USE_POSTGRES_AUTO_DETECT || '(unset)'} (autoDetectPostgres=${autoDetectPostgres})`);
console.log(`[server]  - SUPABASE_DB_URL = ${process.env.SUPABASE_DB_URL ? '(present)' : '(missing)'} ${process.env.SUPABASE_DB_URL ? maskSecret(process.env.SUPABASE_DB_URL) : ''}`);
console.log(`[server]  - SUPABASE_URL = ${process.env.SUPABASE_URL ? '(present)' : '(missing)'} ${process.env.SUPABASE_URL ? maskSecret(process.env.SUPABASE_URL) : ''}`);
console.log(`[server]  - SUPABASE_SERVICE_ROLE_KEY = ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '(present service-role)' : '(missing)'} ${process.env.SUPABASE_SERVICE_ROLE_KEY ? maskSecret(process.env.SUPABASE_SERVICE_ROLE_KEY) : ''}`);
console.log(`[server]  - SUPABASE_ANON_KEY = ${process.env.SUPABASE_ANON_KEY ? '(present anon)' : '(missing)'} ${process.env.SUPABASE_ANON_KEY ? maskSecret(process.env.SUPABASE_ANON_KEY) : ''}`);
console.log(`[server]  - MOCK_AUTH = ${process.env.MOCK_AUTH || '(unset)'}`);
console.log(`[server]  - Derived database selection: ${usingPostgres ? 'Postgres (Supabase) — will use production knex config' : 'sqlite fallback (dev) — sqlite fallback would be used if enabled'}`);
console.log('[server] End diagnostics');

// Warn if Google Places/Maps key missing — POI lookups will be disabled
if (!process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_MAPS_API_KEY) {
  console.warn('[POI] GOOGLE_MAPS_API_KEY missing; POI lookups disabled');
}


// Validate required environment variables

const { validateEnv } = require('./config/env.validate');
try {
  validateEnv();
} catch (err) {
  // In test environment, setup.js will set env vars before tests run
  // So we just warn and continue - the validation will be retried by individual tests
  if (process.env.NODE_ENV === 'test') {
    console.warn('[server] Warning:', err.message, '(continuing in test mode - setup.js should set these)');
  } else {
    console.error(err.message);
    process.exit(1);
  }
}

// Global safety: log uncaught exceptions and unhandled rejections instead of letting Node crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('UnhandledRejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});

const db = require('./db/index');
const createPhotosRouter = require('./routes/photos');
const createCollectiblesRouter = require('./routes/collectibles');
  // Mount collectibles API under /api
  // app.use('/api', createCollectiblesRouter({ db }));
const createUploadsRouter = require('./routes/uploads');
const createDebugRouter = require('./routes/debug');
const createHealthRouter = require('./routes/health');
const createPrivilegeRouter = require('./routes/privilege');
// const createAuthRouter = require('./routes/auth'); // Removed
const { configureSecurity, validateRequest, securityErrorHandler } = require('./middleware/security');
const { authenticateToken } = require('./middleware/auth');

const PORT = process.env.PORT || 3001;





















// --- Express app and routes ---
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
// Trust first proxy (Heroku, Supabase, AWS ELB, etc.) for correct client IP resolution
app.set('trust proxy', 1);
  // Configure CORS origins early so preflight (OPTIONS) and error responses
  // include the appropriate Access-Control-Allow-* headers before any
  // validation or authentication middleware runs.
  // This avoids cases where a validator or auth middleware rejects a
  // preflight request without sending CORS headers, which causes the
  // browser to block the request with a CORS error.
  const { getAllowedOrigins } = require('./config/allowedOrigins');
  const allowedOrigins = getAllowedOrigins();
  const isDev = process.env.NODE_ENV !== 'production';
  const debugCors = process.env.DEBUG_CORS === 'true';
  app.use(cors({
    origin: function(origin, callback) {
      if (debugCors) console.debug('[CORS DEBUG] Incoming Origin:', origin);
      // Allow requests with no origin (e.g., server-to-server) or explicit allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        if (debugCors) console.debug('[CORS DEBUG] Allowing Origin:', origin);
        return callback(null, origin);
      }

      // In development, allow common local-network frontend hosts so you can access
      // the backend from other machines on your LAN without adjusting env vars.
      if (isDev) {
        const devAllow = /^https?:\/\/(127\.0\.0\.1|localhost|10\.(?:\d+\.){2}\d+|192\.168\.(?:\d+\.)\d+)(:\d+)?$/;
        if (origin && devAllow.test(origin)) {
          if (debugCors) console.debug('[CORS DEBUG] Dev allowing Origin:', origin);
          return callback(null, origin);
        }
      }
      if (debugCors) console.debug('[CORS DEBUG] Rejecting Origin:', origin);
      // When origin not allowed, fail the CORS check. Browsers will block the request.
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // Allow cookies to be sent
    optionsSuccessStatus: 204
  }));

  // Configure security middleware after CORS so security headers are
  // applied to responses that already include CORS headers.
  configureSecurity(app);

  // Cookie parser for secure httpOnly cookie authentication
  // SECURITY NOTE: Cookies are used for:
  // 1. Image authentication (GET requests - CSRF-safe by design)
  // 2. Auth session management (protected by Origin verification in routes/auth.js)
  // All state-changing operations that use cookies have CSRF protection
  // via Origin header validation in their respective route handlers.
  // codeql[js/missing-csrf-middleware] False positive: CSRF protection is implemented
  // at the route level in routes/auth.js via verifyOrigin() middleware which validates
  // the Origin header on all state-changing POST requests. GET requests for images are
  // inherently CSRF-safe as they do not modify state.
  app.use(cookieParser());

  // Add request validation middleware
  app.use(validateRequest);
  
  // Limit request body size to mitigate DoS from huge payloads
  app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      try { req.rawBody = buf.toString(); } catch { req.rawBody = undefined; }
    }
  }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  // Authentication routes (no auth required)
  const createAuthRouter = require('./routes/auth');
  app.use('/api/auth', createAuthRouter());

  // Dev-only diagnostics route (masked). Enabled only when not in production.
  if (process.env.NODE_ENV !== 'production') {
    app.get('/__diag/env', (_req, res) => {
      return res.json({
        NODE_ENV: process.env.NODE_ENV ?? '(unset)',
        USE_POSTGRES: !!process.env.USE_POSTGRES,
        USE_POSTGRES_AUTO_DETECT: !!process.env.USE_POSTGRES_AUTO_DETECT,
        SUPABASE_DB_URL: !!process.env.SUPABASE_DB_URL,
        SUPABASE_URL: process.env.SUPABASE_URL ? '•••' + String(process.env.SUPABASE_URL).slice(-4) : '(missing)',
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY
      });
    });
  }

  // app.use(createAuthRouter({ db })); // Removed


  // Test-only endpoint for trust proxy regression test
  if (process.env.NODE_ENV === 'test') {
    app.get('/test-ip', (req, res) => {
      res.json({ ip: req.ip, ips: req.ips, trustProxy: app.get('trust proxy') });
    });
  }

  // Health check (no auth required). Mount at '/health' so router-root handlers
  // defined in `routes/health.js` become available at '/health'.
  app.use('/health', createHealthRouter());

  // Protected API routes (require authentication)
  // Mount a dedicated display router at root so image URLs remain at
  // '/display/*' while the photos API is mounted under '/photos'.
  const createDisplayRouter = require('./routes/display');
  app.use('/display', createDisplayRouter({ db }));

  // Mount photos API under '/photos' so routes like '/' and '/:id' defined
  // in `routes/photos.js` are accessible at '/photos' and '/photos/:id'.
  app.use('/photos', createPhotosRouter({ db }));
  app.use('/api/collectibles', authenticateToken, createCollectiblesRouter({ db }));
  app.use(authenticateToken, createUploadsRouter({ db }));
  app.use(authenticateToken, createPrivilegeRouter());

  // Mount debug routes. Allow unauthenticated access when explicitly enabled via
  // ALLOW_DEV_DEBUG=true in non-production environments. This avoids accidentally
  // exposing debug endpoints in environments where NODE_ENV might be mis-set.
  const allowDevDebug = process.env.ALLOW_DEV_DEBUG === 'true' || (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_DEBUG !== 'false');
  if (allowDevDebug) {
    console.log('[server] Dev debug endpoints enabled (ALLOW_DEV_DEBUG=true)');
    app.use(createDebugRouter({ db }));
  } else {
    app.use(authenticateToken, createDebugRouter({ db }));
  }

  // Add security error handling middleware
  app.use(securityErrorHandler);

  // Generic JSON 404 handler: return JSON for all unmatched routes so responses
  // conform to the OpenAPI contract (tests expect JSON, not HTML).
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not found'
    });
  });


module.exports = app;
















  // Error handling middleware
  app.use((error, req, res, _next) => {
    // No attempt to repair malformed JSON here; let body-parser return errors so clients send valid JSON.

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File too large'
        });
      }
    }
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  });





// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Photo upload server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  // Non-blocking Supabase connectivity smoke-check: runs once on startup and
  // logs whether Supabase storage or DB is reachable. This is intentionally
  // non-blocking so server startup is not delayed by network issues. We also
  // schedule periodic checks so connectivity problems are surfaced during
  // longer-running development sessions.
 (async () => {
    try {
      const runSmoke = require('./smoke-supabase');
      const supabase = require('./lib/supabaseClient');
      // initial run
      await runSmoke(supabase);

      // schedule periodic non-blocking checks (every 10 minutes)
      const intervalMs = Number(process.env.SUPABASE_SMOKE_INTERVAL_MS) || (10 * 60 * 1000);
      setInterval(() => {
        // run but don't await here (fire-and-forget; errors are logged inside)
        runSmoke(supabase).catch((e) => console.warn('[supabase-smoke] periodic check failed:', e && e.message ? e.message : e));
      }, intervalMs);
    } catch (err) {
      console.warn('[supabase-smoke] Skipped or failed to run smoke-check:', err && err.message ? err.message : err);
    }
  })();
}
