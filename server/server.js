const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Global safety: log uncaught exceptions and unhandled rejections instead of letting Node crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('UnhandledRejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});

const db = require('./db/index');
const createPhotosRouter = require('./routes/photos');
const createUploadsRouter = require('./routes/uploads');
const createDebugRouter = require('./routes/debug');
const createHealthRouter = require('./routes/health');
const createPrivilegeRouter = require('./routes/privilege');
const createAuthRouter = require('./routes/auth');
const createDisplayRouter = require('./routes/display');
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
        console.log('[TEST SEED] Inserted test photo id=', inserted.id, 'filename=', seedFilename);
      } else {
        console.log('[TEST SEED] Test photo already exists id=', exists.id);
      }
    } catch (seedErr) {
      console.error('Failed to seed test photo:', seedErr && seedErr.message);
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
    console.log(`[REQUEST] ${req.method} ${req.originalUrl} from ${req.ip}`);
    next();
  });
  // Configure CORS origins early so preflight (OPTIONS) and error responses
  // include the appropriate Access-Control-Allow-* headers before any
  // validation or authentication middleware runs.
  // This avoids cases where a validator or auth middleware rejects a
  // preflight request without sending CORS headers, which causes the
  // browser to block the request with a CORS error.
  const allowedOrigins = [];
  if (process.env.CLIENT_ORIGIN) {
    allowedOrigins.push(process.env.CLIENT_ORIGIN);
  }
  // Allow localhost origins for development
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push(
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://10.0.0.126:5173' // Allow LAN IP for mobile access
    );
  }
  app.use(cors({
    origin: allowedOrigins,
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

  // Public display route (no authentication) so <img> tags can fetch images
  try {
    app.use(createDisplayRouter({ db }));
    console.log('[server] Public /display route attached');
  } catch (attachErr) {
    console.warn('[server] Failed to attach public display route:', attachErr && attachErr.message ? attachErr.message : attachErr);
  }

  // Protected API routes (require authentication)
  app.use(authenticateToken, createPhotosRouter({ db }));
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





  // Start server
  app.listen(PORT, () => {
    console.log(`Photo upload server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

}

startServer();