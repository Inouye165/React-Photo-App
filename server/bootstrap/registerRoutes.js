function registerRoutes(app, { db, supabase, sseManager, logger }) {
  if (!app) throw new Error('app is required');
  if (!db) throw new Error('db is required');
  if (!supabase) throw new Error('supabase is required');
  if (!sseManager) throw new Error('sseManager is required');

  const multer = require('multer');

  const createPhotosRouter = require('../routes/photos');
  const createCollectiblesRouter = require('../routes/collectibles');
  const createUploadsRouter = require('../routes/uploads');
  const createDebugRouter = require('../routes/debug');
  const createHealthRouter = require('../routes/health');
  const createPrivilegeRouter = require('../routes/privilege');
  const createUsersRouter = require('../routes/users');
  const createMetricsRouter = require('../routes/metrics');
  const createPublicRouter = require('../routes/public');
  const createEventsRouter = require('../routes/events');
  const createAdminRouter = require('../routes/admin');

  const { securityErrorHandler } = require('../middleware/security');
  const { authenticateToken, requireRole } = require('../middleware/auth');

  // CSRF token fetch endpoint for the SPA.
  // csurf attaches req.csrfToken() when middleware is mounted.
  app.get('/csrf', (req, res) => {
    if (!req || typeof req.csrfToken !== 'function') {
      return res.status(500).json({ success: false, error: 'CSRF not initialized' });
    }
    return res.json({ csrfToken: req.csrfToken() });
  });

  // Authentication routes (no auth required)
  const createAuthRouter = require('../routes/auth');
  app.use('/api/auth', createAuthRouter({ db }));

  // Public API routes (no auth required) - mounted before auth middleware
  app.use('/api/public', createPublicRouter({ db }));

  // E2E/test-only routes
  const { isE2EEnabled } = require('../config/e2eGate');
  const e2eRouter = require('../routes/e2e');
  app.use('/api/test', (req, res, next) => {
    if (!isE2EEnabled()) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    return e2eRouter(req, res, next);
  });

  // Test-only endpoint for trust proxy regression test
  if (process.env.NODE_ENV === 'test') {
    app.get('/test-ip', (req, res) => {
      res.json({ ip: req.ip, ips: req.ips, trustProxy: app.get('trust proxy') });
    });
  }

  // Protected Prometheus metrics endpoint (no user auth; protected by internal token)
  app.use('/metrics', createMetricsRouter());

  // Health check (no auth required).
  app.use('/health', createHealthRouter());

  // Protected API routes (require authentication)
  const createDisplayRouter = require('../routes/display');
  app.use('/display', createDisplayRouter({ db }));

  app.use('/photos', createPhotosRouter({ db, supabase }));

  app.use('/events', createEventsRouter({ authenticateToken, sseManager }));

  // Mount collectibles API under root so /photos/:id/collectibles works correctly
  app.use(authenticateToken, createCollectiblesRouter({ db }));
  app.use('/api/users', createUsersRouter({ db }));
  app.use(authenticateToken, createUploadsRouter({ db }));
  app.use(authenticateToken, createPrivilegeRouter({ db }));
  
  // Admin routes (protected by authenticateToken + requireRole('admin'))
  app.use('/api/admin', authenticateToken, requireRole('admin'), createAdminRouter({ db }));

  // SECURITY: Debug/diagnostic routes are high risk.
  // - In production, do NOT mount unless explicitly enabled.
  // - In all environments, debug routes require normal authentication.
  const shouldMountDebugRoutes =
    process.env.NODE_ENV !== 'production' || process.env.DEBUG_ROUTES_ENABLED === 'true';
  if (shouldMountDebugRoutes) {
    app.use(authenticateToken, createDebugRouter({ db }));
  }

  // Add security error handling middleware
  app.use(securityErrorHandler);

  // Generic JSON 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'Not found',
    });
  });

  // Error handling middleware
  app.use((error, req, res, _next) => {
    if (error && error.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({
        success: false,
        error: 'CSRF token mismatch or missing',
      });
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File too large',
        });
      }
    }
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  });

  if (logger && typeof logger.isLevelEnabled === 'function' && logger.isLevelEnabled('debug')) {
    logger.debug('[server] Routes registered');
  }
}

module.exports = {
  registerRoutes,
};
