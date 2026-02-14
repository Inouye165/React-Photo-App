import type { Application, NextFunction, Request, Response } from 'express';

type Logger = {
  error?: (message: string, meta?: Record<string, unknown>) => void;
  isLevelEnabled?: (level: string) => boolean;
  debug?: (message: string) => void;
};

type RegisterRoutesDeps = {
  db: unknown;
  supabase: unknown;
  socketManager: unknown;
  logger?: Logger;
};

type CsrfRequest = Request & {
  csrfToken?: () => string;
};

type LegacyRouteMapping = {
  legacyBase: string;
  successorBase: string;
};

const LEGACY_API_SUNSET = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toUTCString();

function createLegacyApiDeprecationMiddleware(mappings: LegacyRouteMapping[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', LEGACY_API_SUNSET);

    const originalUrl = req.originalUrl || req.url || '';
    const match = mappings.find((mapping) => originalUrl.startsWith(mapping.legacyBase));

    const successorUrl = match
      ? `${match.successorBase}${originalUrl.slice(match.legacyBase.length)}`
      : `${mappings[0]?.successorBase || ''}${req.path || ''}`;

    if (successorUrl) {
      res.setHeader('Link', `<${successorUrl}>; rel="successor-version"`);
    }

    return next();
  };
}

export function registerRoutes(app: Application, { db, supabase, socketManager, logger }: RegisterRoutesDeps) {
  if (!app) throw new Error('app is required');
  if (!db) throw new Error('db is required');
  if (!supabase) throw new Error('supabase is required');
  if (!socketManager) throw new Error('socketManager is required');

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
  const createFeedbackRouter = require('../routes/feedback');
  const createEventsRouter = require('../routes/events');
  const createMetaRouter = require('../routes/meta');
  const createAdminRouter = require('../routes/admin');
  const createCommentsRouter = require('../routes/comments');
  const createImageProxyRouter = require('../routes/imageProxy');
  const createCaptureIntentsRouter = require('../routes/captureIntents');
  const createChatRouter = require('../routes/chat');
  const createWhiteboardRouter = require('../routes/whiteboard');
  const createChessTutorRouter = require('../routes/chessTutor');

  const { securityErrorHandler } = require('../middleware/security');
  const { authenticateToken, requireRole } = require('../middleware/auth');

  // CSRF token fetch endpoint for the SPA.
  // csurf attaches req.csrfToken() when middleware is mounted.
  app.get('/csrf', (req: CsrfRequest, res: Response) => {
    // In development and test environments the csurf middleware may be
    // intentionally disabled to simplify local dev and E2E runs. If so,
    // return a stable dev bypass token instead of calling req.csrfToken()
    // which would throw when the middleware is unmounted.
    // If running in dev/test or E2E mode, return the stable dev bypass.
    let e2eEnabled = false;
    try {
      // The e2e gate helper is used below; load it lazily to avoid circular deps.
      // It returns true when the test harness intends to run E2E-only routes.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { isE2EEnabled } = require('../config/e2eGate');
      e2eEnabled = typeof isE2EEnabled === 'function' ? isE2EEnabled() : false;
    } catch {
      e2eEnabled = false;
    }

    if (process.env.NODE_ENV === 'development' || e2eEnabled) {
      try {
        return res.json({ csrfToken: 'dev-bypass' });
      } catch (err) {
        return res.status(500).json({ success: false, error: 'CSRF dev-bypass failed' });
      }
    }

    if (!req || typeof req.csrfToken !== 'function') {
      return res.status(500).json({ success: false, error: 'CSRF not initialized' });
    }

    try {
      return res.json({ csrfToken: req.csrfToken() });
    } catch (err) {
      // Defensive: log the error and return 500 instead of crashing the app.
      const message = err && typeof (err as Error).message === 'string' ? (err as Error).message : String(err);
      // eslint-disable-next-line no-console
      console.error('[routes:/csrf] req.csrfToken() threw:', message);
      return res.status(500).json({ success: false, error: 'CSRF token generation failed' });
    }
  });

  // Authentication routes (no auth required)
  const createAuthRouter = require('../routes/auth');
  const authRouter = createAuthRouter({ db });
  app.use(
    '/api/auth',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/auth', successorBase: '/api/v1/auth' }]),
    authRouter
  );
  app.use('/api/v1/auth', authRouter);

  // Public API routes (no auth required) - mounted before auth middleware
  const publicRouter = createPublicRouter({ db });
  app.use(
    '/api/public',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/public', successorBase: '/api/v1/public' }]),
    publicRouter
  );
  app.use('/api/v1/public', publicRouter);

  // Public feedback endpoint (no auth required)
  const feedbackRouter = createFeedbackRouter({ db });
  app.use(
    '/api/feedback',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/feedback', successorBase: '/api/v1/feedback' }]),
    feedbackRouter
  );
  app.use('/api/v1/feedback', feedbackRouter);

  // Image proxy endpoint (auth required)
  // Used to fetch remote images server-side to avoid browser CORS limitations.
  const imageProxyRouter = createImageProxyRouter();
  app.use(
    '/api/image-proxy',
    createLegacyApiDeprecationMiddleware([
      { legacyBase: '/api/image-proxy', successorBase: '/api/v1/image-proxy' },
    ]),
    authenticateToken,
    imageProxyRouter
  );
  app.use('/api/v1/image-proxy', authenticateToken, imageProxyRouter);

  // E2E/test-only routes
  const { isE2EEnabled } = require('../config/e2eGate');
  const e2eRouter = require('../routes/e2e');
  const e2eGate = (req: Request, res: Response, next: NextFunction) => {
    if (!isE2EEnabled()) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    return e2eRouter(req, res, next);
  };
  app.use(
    '/api/test',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/test', successorBase: '/api/v1/test' }]),
    e2eGate
  );
  app.use('/api/v1/test', e2eGate);

  // Test-only endpoint for trust proxy regression test
  if (process.env.NODE_ENV === 'test') {
    app.get('/test-ip', (req: Request, res: Response) => {
      res.json({ ip: req.ip, ips: req.ips, trustProxy: app.get('trust proxy') });
    });
  }

  // Protected Prometheus metrics endpoint (no user auth; protected by internal token)
  app.use('/metrics', createMetricsRouter());

  // Health check (no auth required).
  app.use('/health', createHealthRouter());

  // Build metadata (no auth required).
  app.use('/api/meta', createMetaRouter());

  // Protected API routes (require authentication)
  const createDisplayRouter = require('../routes/display');
  const displayRouter = createDisplayRouter({ db });
  app.use(
    '/display',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/display', successorBase: '/api/v1/display' }]),
    displayRouter
  );
  app.use('/api/v1/display', displayRouter);

  const photosRouter = createPhotosRouter({ db, supabase });
  app.use(
    '/photos',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/photos', successorBase: '/api/v1/photos' }]),
    photosRouter
  );
  app.use('/api/v1/photos', photosRouter);

  const eventsRouter = createEventsRouter({ authenticateToken, socketManager });
  app.use(
    '/events',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/events', successorBase: '/api/v1/events' }]),
    eventsRouter
  );
  app.use('/api/v1/events', eventsRouter);

  const whiteboardRouter = createWhiteboardRouter({ db });
  app.use(
    '/api/whiteboard',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/whiteboard', successorBase: '/api/v1/whiteboard' }]),
    authenticateToken,
    whiteboardRouter
  );
  app.use('/api/v1/whiteboard', authenticateToken, whiteboardRouter);

  const captureIntentsRouter = createCaptureIntentsRouter({ db, socketManager });
  app.use(
    '/capture-intents',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/capture-intents', successorBase: '/api/v1/capture-intents' }]),
    authenticateToken,
    captureIntentsRouter
  );
  app.use('/api/v1/capture-intents', authenticateToken, captureIntentsRouter);

  // Mount collectibles API under root so /photos/:id/collectibles works correctly
  app.use(
    '/collectibles',
    createLegacyApiDeprecationMiddleware([
      { legacyBase: '/collectibles', successorBase: '/api/v1/collectibles' },
    ])
  );
  app.use(
    '/upload',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/upload', successorBase: '/api/v1/upload' }])
  );
  app.use(
    '/privilege',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/privilege', successorBase: '/api/v1/privilege' }])
  );
  const collectiblesRouter = createCollectiblesRouter({ db });
  app.use(authenticateToken, collectiblesRouter);
  app.use('/api/v1', authenticateToken, collectiblesRouter);
  const usersRouter = createUsersRouter({ db });
  app.use(
    '/api/users',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/users', successorBase: '/api/v1/users' }]),
    usersRouter
  );
  app.use('/api/v1/users', usersRouter);
  const uploadsRouter = createUploadsRouter({ db, socketManager });
  app.use(authenticateToken, uploadsRouter);
  app.use('/api/v1', authenticateToken, uploadsRouter);
  const privilegeRouter = createPrivilegeRouter({ db });
  app.use(authenticateToken, privilegeRouter);
  app.use('/api/v1', authenticateToken, privilegeRouter);

  // Comments routes (protected by authenticateToken)
  const commentsRouter = createCommentsRouter({ db });
  app.use(
    '/api/comments',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/comments', successorBase: '/api/v1/comments' }]),
    authenticateToken,
    commentsRouter
  );
  app.use('/api/v1/comments', authenticateToken, commentsRouter);

  // Admin routes (protected by authenticateToken + requireRole('admin'))
  const adminRouter = createAdminRouter({ db });
  app.use(
    '/api/admin',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/admin', successorBase: '/api/v1/admin' }]),
    authenticateToken,
    requireRole('admin'),
    adminRouter
  );
  app.use('/api/v1/admin', authenticateToken, requireRole('admin'), adminRouter);

  // Chat room purpose/config endpoints (auth required).
  const chatRouter = createChatRouter({ db });
  app.use('/api/v1/chat', authenticateToken, chatRouter);

  // Chess tutor analysis endpoint (auth required, invoked on-demand by UI).
  const chessTutorRouter = createChessTutorRouter();
  app.use(
    '/api/chess-tutor',
    createLegacyApiDeprecationMiddleware([{ legacyBase: '/api/chess-tutor', successorBase: '/api/v1/chess-tutor' }]),
    authenticateToken,
    chessTutorRouter
  );
  app.use('/api/v1/chess-tutor', authenticateToken, chessTutorRouter);

  // Debug/diagnostic routes require normal authentication.
  // NOTE: Mounted in all environments; additional hardening can be done inside the router
  // (e.g., DEBUG_ADMIN_TOKEN header gate).
  app.use(authenticateToken, createDebugRouter({ db }));

  // Add security error handling middleware
  app.use(securityErrorHandler);

  // Generic JSON 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Not found',
    });
  });

  // Error handling middleware
  app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    const isProd = process.env.NODE_ENV === 'production';

    if (error && (error.code === 'CORS_NOT_ALLOWED' || error.message === 'Not allowed by CORS')) {
      return res.status(403).json({
        success: false,
        error: 'Origin not allowed',
      });
    }

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

    // Log full error server-side, but don't leak details to clients.
    try {
      if (logger && typeof logger.error === 'function') {
        logger.error('[server] Unhandled error', {
          method: req?.method,
          path: req?.originalUrl || req?.url,
          message: error?.message,
          code: error?.code,
          stack: error?.stack,
        });
      } else {
        console.error('Server error:', error);
      }
    } catch {
      // never crash error handler
    }

    return res.status(500).json({
      success: false,
      error: isProd ? 'Internal server error' : (error && error.message ? error.message : 'Internal server error'),
    });
  });

  if (logger && typeof logger.isLevelEnabled === 'function' && logger.isLevelEnabled('debug')) {
    logger.debug('[server] Routes registered');
  }
}
