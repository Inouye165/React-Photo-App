const path = require('path');
const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '.env') });
console.log('[dotenv] .env loaded:', dotenvResult.parsed ? Object.keys(dotenvResult.parsed) : dotenvResult.error);
console.log('[env] SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('[env] SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY);

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
const { configureSecurity, validateRequest, securityErrorHandler } = require('./middleware/security');
const { authenticateToken } = require('./middleware/auth');

const PORT = process.env.PORT || 3001;





















async function startServer() {
  // Run database migrations
  await db.migrate.latest();

  // --- Express app and routes ---
  const express = require('express');
  const multer = require('multer');
  const cors = require('cors');
  const cookieParser = require('cookie-parser');
  const app = express();
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
    allowedOrigins.push('http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174');
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
  
  app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      try { req.rawBody = buf.toString(); } catch { req.rawBody = undefined; }
    }
  }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Authentication routes (no auth required)
  app.use(createAuthRouter({ db }));

  // Health check (no auth required)
  app.use(createHealthRouter());

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