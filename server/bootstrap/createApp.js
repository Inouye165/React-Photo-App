function createApp(options = {}) {
  const express = require('express');
  let createSocketManager;
  try {
    ({ createSocketManager } = require('../realtime/SocketManager'));
  } catch (error) {
    const message = error && error.message ? String(error.message) : '';
    if (error && error.code === 'MODULE_NOT_FOUND' && message.includes('SocketManager')) {
      ({ createSocketManager } = require('../realtime/SocketManager.ts'));
    } else {
      throw error;
    }
  }
  const { createPhotoEventHistory } = require('../realtime/photoEventHistory');
  const { getRedisClient } = require('../lib/redis');
  const metrics = require('../metrics');

  const logger = options.logger || require('../logger');
  const db = options.db || require('../db/index');
  const supabase = options.supabase || require('../lib/supabaseClient');

  const { registerMiddleware } = require('./registerMiddleware');
  let registerRoutes;
  try {
    ({ registerRoutes } = require('./registerRoutes'));
  } catch (error) {
    const message = error && error.message ? String(error.message) : '';
    if (error && error.code === 'MODULE_NOT_FOUND' && message.includes('registerRoutes')) {
      ({ registerRoutes } = require('./registerRoutes.ts'));
    } else {
      throw error;
    }
  }

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

  const socketManager = createSocketManager({
    heartbeatMs: 25_000,
    maxConnectionsPerUser: 3,
    metrics,
    logger,
    photoEventHistory,
  });

  registerRoutes(app, { db, supabase, socketManager, logger });

  return { app, socketManager };
}

module.exports = {
  createApp,
};
