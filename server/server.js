const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Global safety: log uncaught exceptions and unhandled rejections instead of letting Node crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('UnhandledRejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});

const { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR, THUMB_DIR } = require('./config/paths');

const { openDb, migrate } = require('./db/index');
const { backfillFileSizes, cleanupMissingFiles, cleanupMissingInprogressFiles } = require('./db/maintenance');
const { ensureAllThumbnails, ensureAllFilesHashed } = require('./media/image');
const { processAllUnprocessedInprogress } = require('./ai/service');
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
  const db = openDb();
  await migrate(db);
  // provide promise wrappers used by route modules
  const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (e, r) => e ? reject(e) : resolve(r)));
  const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, r) => e ? reject(e) : resolve(r)));
  const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function(e) { e ? reject(e) : resolve(this) }));
  await backfillFileSizes(db, { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR });
  await ensureAllFilesHashed(db, WORKING_DIR, THUMB_DIR);
  await cleanupMissingFiles(db, WORKING_DIR);
  await cleanupMissingInprogressFiles(db, INPROGRESS_DIR);
  await processAllUnprocessedInprogress(db, INPROGRESS_DIR);

  // --- Express app and routes ---
  const express = require('express');
  const multer = require('multer');
  const cors = require('cors');
  const cookieParser = require('cookie-parser');
  const app = express();

  // Configure security middleware first
  configureSecurity(app);

  // Add cookie parser for potential session management
  app.use(cookieParser());

  // Add request validation middleware
  app.use(validateRequest);

  // Allow cross-origin requests from local dev servers (keep permissive for development)
  app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'], // Add common React dev server ports
    credentials: true // Allow cookies to be sent
  }));
  
  app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      try { req.rawBody = buf.toString(); } catch { req.rawBody = undefined; }
    }
  }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Authentication routes (no auth required)
  app.use(createAuthRouter({ db, dbGet, dbAll, dbRun }));

  // Health check (no auth required)
  app.use(createHealthRouter());

  // --- Protected static file serving ---
  // Serve images statically from working dir (with authentication)
  app.use('/working', authenticateToken, express.static(WORKING_DIR));
  app.use('/inprogress', authenticateToken, express.static(INPROGRESS_DIR));
  app.use('/finished', authenticateToken, express.static(FINISHED_DIR));

  // Display endpoint for images (with authentication)
  app.get('/display/:state/:filename', authenticateToken, (req, res) => {
    const { state, filename } = req.params;
    let dir;
    switch(state) {
      case 'working': dir = WORKING_DIR; break;
      case 'inprogress': dir = INPROGRESS_DIR; break;
      case 'finished': dir = FINISHED_DIR; break;
      default: return res.status(400).json({ success: false, error: 'Invalid state' });
    }
    res.sendFile(path.join(dir, filename));
  });

  // Protected API routes (require authentication)
  app.use(authenticateToken, createPhotosRouter({ db, dbGet, dbAll, dbRun }, { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR, THUMB_DIR }));
  app.use(authenticateToken, createUploadsRouter({ db, dbGet, dbAll, dbRun }, { WORKING_DIR, INPROGRESS_DIR, THUMB_DIR }));
  app.use(authenticateToken, createDebugRouter({ db }, { INPROGRESS_DIR }));
  app.use(authenticateToken, createPrivilegeRouter({ WORKING_DIR, INPROGRESS_DIR }));

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
    console.log(`Working directory: ${WORKING_DIR}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  // Generate thumbnails asynchronously after server start (do not block startup)
  ensureAllThumbnails(db, WORKING_DIR, THUMB_DIR).catch(err => console.error('ensureAllThumbnails failed:', err));

}

startServer();