function createApp(options = {}) {
  const express = require('express');
  const { createSseManager } = require('../realtime/sseManager');

  const logger = options.logger || require('../logger');
  const db = options.db || require('../db/index');
  const supabase = options.supabase || require('../lib/supabaseClient');

  const { registerMiddleware } = require('./registerMiddleware');
  const { registerRoutes } = require('./registerRoutes');

  const app = express();

  // Reduce passive fingerprinting.
  app.disable('x-powered-by');

  // Trust first proxy (Heroku, Supabase, AWS ELB, etc.) for correct client IP resolution
  app.set('trust proxy', 1);

  registerMiddleware(app);

  // Real-time photo processing events (Phase 1: single instance, in-memory fanout)
  const sseManager = createSseManager({ heartbeatMs: 25_000, maxConnectionsPerUser: 3 });

  registerRoutes(app, { db, supabase, sseManager, logger });

  return { app, sseManager };
}

module.exports = {
  createApp,
};
