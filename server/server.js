const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const logger = require('./logger');

// Helpful startup logs to make it obvious which DB and Supabase configuration
// are active when the server starts (useful after checking out older commits).
const environment = process.env.NODE_ENV || 'development';
const forcePostgres = process.env.USE_POSTGRES === 'true';
const autoDetectPostgres = Boolean(process.env.SUPABASE_DB_URL) && process.env.USE_POSTGRES_AUTO_DETECT !== 'false';
const usingPostgres = environment === 'production' || forcePostgres || autoDetectPostgres;
logger.info(`[server] NODE_ENV=${environment} USE_POSTGRES=${process.env.USE_POSTGRES || ''} USE_POSTGRES_AUTO_DETECT=${process.env.USE_POSTGRES_AUTO_DETECT || ''}`);
logger.info(`[server] Database mode: ${usingPostgres ? 'Postgres (Supabase)' : 'sqlite fallback (dev)'}; SUPABASE_DB_URL=${process.env.SUPABASE_DB_URL ? 'present' : 'missing'}; SUPABASE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service-role' : (process.env.SUPABASE_ANON_KEY ? 'anon' : 'missing')}`);

// Global safety: log uncaught exceptions and unhandled rejections instead of letting Node crash
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UnhandledRejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('UncaughtException:', err);
});

const db = require('./db/index');
const createPhotosRouter = require('./routes/photos');
const createUploadsRouter = require('./routes/uploads');
const createDebugRouter = require('./routes/debug');
const createHealthRouter = require('./routes/health');
const createPrivilegeRouter = require('./routes/privilege');
const createAuthRouter = require('./routes/auth');
const { configureSecurity, validateRequest, securityErrorHandler } = require('./middleware/security');
const { authenticateToken } = require('./middleware/auth');

const PORT = process.env.PORT || 3001;





















async function startServer() {
  // Run database migrations
  await db.migrate.latest();

  // Seed a test photo when running in test mode so we can exercise routes
  if (process.env.NODE_ENV === 'test') {
    try {
      const seedFilename = 'seed-test.jpg';
      const exists = await db('photos').where({ filename: seedFilename }).first();
      if (!exists) {
        await db('photos').insert({
          filename: seedFilename,
          state: 'working',
          metadata: JSON.stringify({}),
          storage_path: `working/${seedFilename}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        const inserted = await db('photos').where({ filename: seedFilename }).first();
        logger.debug('[TEST SEED] Inserted test photo id=', inserted.id, 'filename=', seedFilename);
      } else {
        logger.debug('[TEST SEED] Test photo already exists id=', exists.id);
      }
    } catch (seedErr) {
      logger.error('Failed to seed test photo:', seedErr && seedErr.message);
    }
  }

  // --- Express app and routes ---
  const express = require('express');
  const multer = require('multer');
  const cors = require('cors');
  const cookieParser = require('cookie-parser');
  const app = express();

  // Log basic incoming request info for debugging (do NOT log headers which may contain secrets)
  app.use((req, res, next) => {
    logger.debug(`[REQUEST] ${req.method} ${req.originalUrl} from ${req.ip}`);
    next();
  });
  // Configure CORS origins early so preflight (OPTIONS) and error responses
  // include the appropriate Access-Control-Allow-* headers before any
  // validation or authentication middleware runs.
  // This avoids cases where a validator or auth middleware rejects a
  // preflight request without sending CORS headers, which causes the
  // browser to block the request with a CORS error.
  const { getAllowedOrigins } = require('./config/allowedOrigins');
  const allowedOrigins = getAllowedOrigins();
  app.use(cors({
    origin: function(origin, callback) {
      logger.debug('[CORS DEBUG] Incoming Origin:', origin);
      if (!origin || allowedOrigins.includes(origin)) {
        logger.debug('[CORS DEBUG] Allowing Origin:', origin);
        callback(null, origin);
      } else {
        logger.debug('[CORS DEBUG] Rejecting Origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true // Allow cookies to be sent
  }));

  // Configure security middleware after CORS so security headers are
  // applied to responses that already include CORS headers.
  configureSecurity(app);

  // Add cookie parser for potential session management
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
  app.use(createAuthRouter({ db }));

  // Health check (no auth required)
  app.use(createHealthRouter());

  // Protected API routes (require authentication)
  // Photos router handles its own authentication for API vs image endpoints
  app.use(createPhotosRouter({ db }));
  app.use(authenticateToken, createUploadsRouter({ db }));
  app.use(authenticateToken, createPrivilegeRouter());

  // Mount debug routes. Allow unauthenticated access when explicitly enabled via
  // ALLOW_DEV_DEBUG=true in non-production environments. This avoids accidentally
  // exposing debug endpoints in environments where NODE_ENV might be mis-set.
  const allowDevDebug = process.env.ALLOW_DEV_DEBUG === 'true' || (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_DEBUG !== 'false');
  if (allowDevDebug) {
  logger.info('[server] Dev debug endpoints enabled (ALLOW_DEV_DEBUG=true)');
    app.use(createDebugRouter({ db }));
  } else {
    app.use(authenticateToken, createDebugRouter({ db }));
  }

  // Add security error handling middleware
  app.use(securityErrorHandler);

















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
  logger.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  });





  // Start server
  app.listen(PORT, () => {
    logger.info(`Photo upload server running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
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
        runSmoke(supabase).catch((e) => logger.warn('[supabase-smoke] periodic check failed:', e && e.message ? e.message : e));
      }, intervalMs);
    } catch (err) {
      logger.warn('[supabase-smoke] Skipped or failed to run smoke-check:', err && err.message ? err.message : err);
    }
  })();

}

// Start server and ensure any top-level async errors are logged clearly
startServer().catch((err) => {
  logger.error('startServer failed:', err && (err.stack || err.message || err));
  // Exit with non-zero so process supervisors notice the failure
  process.exit(1);
});