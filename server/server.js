// Load server/.env as the very first runtime config to ensure modules
// that read process.env later see the correct values regardless of CWD.
require('./env');

// Version logging for deployment tracking
let APP_VERSION = null;
try {
  APP_VERSION = require('./version.js').APP_VERSION;
} catch {
  // fallback: not critical
}
if (APP_VERSION) {
  console.log('Starting server - version:', APP_VERSION);
}

// Validate required PostgreSQL configuration early
if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  console.error('[server] FATAL: PostgreSQL not configured');
  console.error('[server] DATABASE_URL or SUPABASE_DB_URL is required');
  console.error('[server] For local development, run: docker-compose up -d db');
  console.error('[server] Then set DATABASE_URL in server/.env');
  process.exit(1);
}

// Helpful startup logs to confirm database configuration
const environment = process.env.NODE_ENV || 'development';

// Helper to mask secrets while showing short hint
function maskSecret(value) {
  if (!value) return '(missing)';
  return '•••' + String(value).slice(-4);
}

console.log('[server] Startup configuration diagnostics:');
console.log(`[server]  - NODE_ENV = ${environment}`);
console.log(`[server]  - DATABASE_URL = ${process.env.DATABASE_URL ? maskSecret(process.env.DATABASE_URL) : '(not set)'}`);
console.log(`[server]  - SUPABASE_DB_URL = ${process.env.SUPABASE_DB_URL ? maskSecret(process.env.SUPABASE_DB_URL) : '(not set)'}`);
console.log(`[server]  - SUPABASE_URL = ${process.env.SUPABASE_URL ? maskSecret(process.env.SUPABASE_URL) : '(missing)'}`);
console.log(`[server]  - SUPABASE_SERVICE_ROLE_KEY = ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '(present)' : '(missing)'} ${process.env.SUPABASE_SERVICE_ROLE_KEY ? maskSecret(process.env.SUPABASE_SERVICE_ROLE_KEY) : ''}`);
console.log(`[server]  - SUPABASE_ANON_KEY = ${process.env.SUPABASE_ANON_KEY ? '(present)' : '(missing)'} ${process.env.SUPABASE_ANON_KEY ? maskSecret(process.env.SUPABASE_ANON_KEY) : ''}`);
console.log(`[server]  - Database: PostgreSQL (all environments)`);
console.log('[server] End diagnostics');

// Warn if Google Places/Maps key missing — POI lookups will be disabled
if (!process.env.GOOGLE_PLACES_API_KEY && !process.env.GOOGLE_MAPS_API_KEY) {
  console.warn('[POI] GOOGLE_MAPS_API_KEY missing; POI lookups disabled');
}

// Validate critical AI keys before starting server to prevent API waste
if (process.env.NODE_ENV !== 'test') {
  const missingAIKeys = [];
  
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
    missingAIKeys.push('OPENAI_API_KEY');
  }
  
  if (missingAIKeys.length > 0) {
    console.error('[server] FATAL: Required AI API keys missing');
    missingAIKeys.forEach(key => console.error(`[server]  - ${key} is required`));
    console.error('[server] AI pipeline will fail without these keys');
    console.error('[server] Server startup blocked to prevent unnecessary API costs');
    process.exit(1);
  }
  
  console.log('[server] ✓ AI API keys present');
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

// Import logger for proper error logging
const logger = require('./logger');

// CRITICAL: Process lifecycle management for production environments
// 
// According to Node.js documentation (https://nodejs.org/api/process.html#event-uncaughtexception):
// "It is not safe to resume normal operation after 'uncaughtException' because
// the system may be in an undefined state."
//
// Production Strategy:
// - Log the error with full stack trace for debugging
// - Exit immediately with code 1 to signal failure to orchestrator
// - Kubernetes/Docker will restart the pod to restore clean state
// - This prevents data corruption and silent failures
//
// This is standard practice at big-tech companies (Google, Meta, Netflix, etc.)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UnhandledRejection at:', promise, 'reason:', reason);
  // Note: We don't exit on unhandled rejection by default
  // The application can often recover from promise rejections
});

process.on('uncaughtException', (err) => {
  // CRITICAL: Use fatal level to ensure this is always logged
  logger.fatal('UncaughtException - Application in undefined state, exiting:', err);
  
  // Attempt to flush logs before exit (best effort)
  // Most loggers flush synchronously on fatal, but we don't wait
  
  // MANDATORY: Exit with failure code for orchestrator to detect and restart
  // Without this exit, the process hangs in an undefined state
  process.exit(1);
});

const db = require('./db/index');
const supabase = require('./lib/supabaseClient');
const createPhotosRouter = require('./routes/photos');
const createCollectiblesRouter = require('./routes/collectibles');
  // Mount collectibles API under /api
  // app.use('/api', createCollectiblesRouter({ db }));
const createUploadsRouter = require('./routes/uploads');
const createDebugRouter = require('./routes/debug');
const createHealthRouter = require('./routes/health');
const createPrivilegeRouter = require('./routes/privilege');
const createUsersRouter = require('./routes/users');
// const createAuthRouter = require('./routes/auth'); // Removed
const createPublicRouter = require('./routes/public');
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
  //
  // SECURITY: Strict allowlist-based CORS policy
  // - No regex patterns or IP range wildcards (prevents DNS rebinding)
  // - Explicit origin check via Array.includes() only
  // - Configure allowed origins via ALLOWED_ORIGINS environment variable
  const { getAllowedOrigins } = require('./config/allowedOrigins');
  const allowedOrigins = getAllowedOrigins();
  // --- CORS Startup Logging ---
  // Print allowed origins at startup (non-prod or DEBUG_CORS=true)
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_CORS === 'true') {
    const logger = require('./logger');
    logger.info(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
  }
  // --- Centralized CORS Middleware ---
  // See config/allowedOrigins.js for full logic and documentation.
  app.use(cors({
    origin: function(origin, callback) {
      const isAllowed = !origin || allowedOrigins.includes(origin);
      if (process.env.NODE_ENV !== 'test' && process.env.DEBUG_CORS === 'true') {
        // Extra debug logging if enabled
        const logger = require('./logger');
        logger.info('[CORS DEBUG]', { origin, isAllowed, allowedOrigins });
      }
      // Allow requests with no origin (e.g., server-to-server) or explicit allowed origins
      if (isAllowed) {
        return callback(null, origin);
      }
      // When origin not allowed, fail the CORS check. Browsers will block the request.
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // Allow cookies to be sent
    // Cache successful preflight results in browsers to reduce repeated OPTIONS overhead.
    // SECURITY: This does not change the allowlist or credential policy; it only allows
    // the browser to reuse the preflight decision for a period of time.
    maxAge: Number(process.env.CORS_MAX_AGE_SECONDS || 600),
    optionsSuccessStatus: 204
  }));

  // Configure security middleware after CORS so security headers are
  // applied to responses that already include CORS headers.
  configureSecurity(app);

  // Cookie parser for secure httpOnly cookie authentication
  // CSRF PROTECTION ARCHITECTURE:
  // This application implements CSRF protection through Origin validation rather than
  // traditional CSRF tokens. This approach is valid and recommended by OWASP:
  // https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#verifying-origin-with-standard-headers
  //
  // Implementation details:
  // 1. GET requests to /display/* are CSRF-safe (read-only, no state changes)
  // 2. POST requests to /api/auth/* are protected by verifyOrigin() middleware
  //    which validates the Origin header against allowedOrigins whitelist
  // 3. SameSite cookies provide additional CSRF protection in modern browsers
  //
  // This is more secure than token-based CSRF for our use case because:
  // - No CSRF token exposure risk
  // - Works seamlessly with <img> tags for authenticated image serving
  // - Simpler client implementation (no token management)
  // - Defense-in-depth: Origin validation + SameSite cookies + HTTPS
  //
  // github/codeql/missing-csrf-middleware: False positive - Origin-based CSRF protection
  // implemented in routes/auth.js via verifyOrigin() middleware
  app.use(cookieParser());

  // Add request validation middleware
  app.use(validateRequest);
  
  // Limit request body size to mitigate DoS from huge payloads
  // SECURITY: No rawBody capture to prevent memory exhaustion
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  // Authentication routes (no auth required)
  const createAuthRouter = require('./routes/auth');
  app.use('/api/auth', createAuthRouter({ db }));

  // Public API routes (no auth required) - mounted before auth middleware
  app.use('/api/public', createPublicRouter({ db }));

  // E2E test login route (only in non-production)
  if (process.env.NODE_ENV !== 'production') {
    const e2eRouter = require('./routes/e2e');
    app.use('/api/test', e2eRouter);
  }

  // SECURITY: Debug routes removed to prevent information disclosure
  // Previously exposed environment variable configuration via /__diag/env

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
  app.use('/photos', createPhotosRouter({ db, supabase }));
  // Mount collectibles API under root so /photos/:id/collectibles works correctly
  app.use(authenticateToken, createCollectiblesRouter({ db }));
  app.use('/api/users', createUsersRouter({ db }));
  app.use(authenticateToken, createUploadsRouter({ db }));
  app.use(authenticateToken, createPrivilegeRouter({ db }));

  // SECURITY: Debug/diagnostic routes are high risk.
  // - In production, do NOT mount unless explicitly enabled.
  // - In all environments, debug routes require normal authentication.
  const shouldMountDebugRoutes = (process.env.NODE_ENV !== 'production') || (process.env.DEBUG_ROUTES_ENABLED === 'true');
  if (shouldMountDebugRoutes) {
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
