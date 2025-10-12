const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR, THUMB_DIR } = require('./config/paths');

const { openDb, migrate, migratePhotoTable } = require('./db/index');
const { backfillFileSizes, cleanupMissingFiles, cleanupMissingInprogressFiles } = require('./db/maintenance');
const { generateThumbnail, ensureAllThumbnails, ensureAllFilesHashed, ingestPhoto } = require('./media/image');
const { copyExifMetadata } = require('./media/exif');
const { processPhotoAI, updatePhotoAIMetadata, processAllUnprocessedInprogress } = require('./ai/service');
const createPhotosRouter = require('./routes/photos');
const createUploadsRouter = require('./routes/uploads');
const createDebugRouter = require('./routes/debug');
const createHealthRouter = require('./routes/health');
const createPrivilegeRouter = require('./routes/privilege');
const { createUploadMiddleware } = require('./media/uploader');

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
  const app = express();

  // Allow cross-origin requests from local dev servers (keep permissive for development)
  app.use(cors());
  app.use(express.json({
    limit: '50mb',
    verify: (req, res, buf) => {
      try { req.rawBody = buf.toString(); } catch (e) { req.rawBody = undefined; }
    }
  }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Create upload middleware using centralized configuration
  const upload = createUploadMiddleware(WORKING_DIR);





  // --- Serve images statically from working dir ---
  app.use('/working', express.static(WORKING_DIR));

  // --- Inprogress directory setup ---
  app.use('/inprogress', express.static(INPROGRESS_DIR));

  // --- Finished directory setup ---
  app.use('/finished', express.static(FINISHED_DIR));

  // Use modular routers
  app.use(createPhotosRouter({ db, dbGet, dbAll, dbRun }, { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR, THUMB_DIR }));
  app.use(createUploadsRouter({ db, dbGet, dbAll, dbRun }, { WORKING_DIR, INPROGRESS_DIR, THUMB_DIR }));
  app.use(createDebugRouter({ db }, { INPROGRESS_DIR }));
  app.use(createPrivilegeRouter({ WORKING_DIR, INPROGRESS_DIR }));
  app.use(createHealthRouter());

















  // Error handling middleware
  app.use((error, req, res, next) => {
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