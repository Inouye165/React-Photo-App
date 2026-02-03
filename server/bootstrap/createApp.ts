type CreateAppOptions = {
  logger?: unknown;
  db?: unknown;
  supabase?: unknown;
};

function createApp(options: CreateAppOptions = {}) {
  const express = require('express');
  const { createSocketManager } = require('../realtime/SocketManager');
  const { createPhotoEventHistory } = require('../realtime/photoEventHistory');
  const { createWhiteboardYjsServer } = require('../realtime/whiteboard');
  const { getRedisClient } = require('../lib/redis');
  const metrics = require('../metrics');

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

  // Real-time photo processing events (WebSocket fanout)
  const photoEventHistory = createPhotoEventHistory({
    redis: getRedisClient(),
    ttlSeconds: Number(process.env.REALTIME_HISTORY_TTL_SECONDS || 600),
    maxEntries: Number(process.env.REALTIME_HISTORY_MAX_ENTRIES || 200),
    maxReplay: Number(process.env.REALTIME_HISTORY_MAX_REPLAY || 200),
    logger,
  });

  const whiteboardYjsServer = createWhiteboardYjsServer({ db, logger, metrics });

  const socketManager = createSocketManager({
    heartbeatMs: 25_000,
    maxConnectionsPerUser: 3,
    metrics,
    logger,
    photoEventHistory,
    clientMessageHandler: null,
  });

  registerRoutes(app, { db, supabase, socketManager, logger });

  return { app, socketManager, whiteboardYjsServer };
}

module.exports = {
  createApp,
};
