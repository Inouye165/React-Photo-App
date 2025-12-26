const express = require('express');
const { authenticateToken: defaultAuthenticateToken } = require('../middleware/auth');
const { createSseManager, formatSseEvent } = require('../realtime/sseManager');
const { getRedisClient } = require('../lib/redis');
const { createPhotoEventHistory } = require('../realtime/photoEventHistory');
const metrics = require('../metrics');
const logger = require('../logger');
const { getOrCreateRequestId } = require('../validation/validateRequest');

function isRealtimeDisabled() {
  const v = String(process.env.REALTIME_EVENTS_DISABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function safeWrite(res, chunk) {
  try {
    const ok = res.write(chunk);
    return ok !== false;
  } catch {
    return false;
  }
}

function normalizeSinceParam(raw) {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  // Prevent extremely long values from causing memory/log issues.
  if (s.length > 128) return undefined;
  return s;
}

function instrumentAuthMiddleware(authenticateTokenMiddleware, opts = {}) {
  const m = opts.metrics || null;

  return (req, res, next) => {
    let recorded = false;

    const recordIfAuthFail = () => {
      if (recorded) return;
      const st = Number(res.statusCode);
      if (st === 401 || st === 403) {
        recorded = true;
        try {
          m?.incRealtimeDisconnectReason?.('auth_fail');
        } catch {
          // ignore
        }
      }
    };

    // Avoid replacing jest.fn mocks in unit tests.
    if (res && typeof res.json === 'function') {
      const jsonFn = res.json;
      if (jsonFn && jsonFn._isMockFunction && typeof jsonFn.mockImplementation === 'function') {
        const currentImpl = jsonFn.getMockImplementation ? jsonFn.getMockImplementation() : null;
        jsonFn.mockImplementation((...args) => {
          recordIfAuthFail();
          return currentImpl ? currentImpl(...args) : res;
        });
      } else {
        const originalJson = res.json.bind(res);
        res.json = (...args) => {
          recordIfAuthFail();
          return originalJson(...args);
        };
      }
    }

    if (res && typeof res.end === 'function') {
      const endFn = res.end;
      if (endFn && endFn._isMockFunction && typeof endFn.mockImplementation === 'function') {
        const currentImpl = endFn.getMockImplementation ? endFn.getMockImplementation() : null;
        endFn.mockImplementation((...args) => {
          recordIfAuthFail();
          return currentImpl ? currentImpl(...args) : undefined;
        });
      } else {
        const originalEnd = res.end.bind(res);
        res.end = (...args) => {
          recordIfAuthFail();
          return originalEnd(...args);
        };
      }
    }

    return authenticateTokenMiddleware(req, res, next);
  };
}

function createPhotosEventsHandler({ sseManager, photoEventHistory, log, metrics: m }) {
  if (!sseManager) throw new Error('sseManager is required');

  return async (req, res) => {
    const requestId = getOrCreateRequestId(req);

    if (isRealtimeDisabled()) {
      return res.status(503).json({ success: false, error: 'Real-time events disabled', requestId });
    }

    const userId = req.user && req.user.id ? String(req.user.id) : null;

    if (!userId) {
      try {
        m?.incRealtimeDisconnectReason?.('auth_fail');
      } catch {
        // ignore
      }
      return res.status(401).json({ success: false, error: 'Unauthorized', requestId });
    }

    // Enforce per-user connection cap *before* opening the stream.
    if (!sseManager.canAcceptClient(userId)) {
      return res.status(429).json({ success: false, error: 'Too many concurrent event streams' });
    }

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Catch-up (bounded): replay missed photo.processing events for this user.
    const since = normalizeSinceParam(req.query && req.query.since);
    if (photoEventHistory && typeof photoEventHistory.getCatchupEvents === 'function') {
      try {
        const out = await photoEventHistory.getCatchupEvents({ userId, since });
        if (out && out.ok && Array.isArray(out.events) && out.events.length > 0) {
          for (const evt of out.events) {
            const ok = safeWrite(res, formatSseEvent({ eventName: 'photo.processing', eventId: String(evt.eventId), data: evt }));
            if (!ok) {
              // Backpressure/stream error during catch-up; abort without registering.
              try {
                m?.incRealtimeDisconnectReason?.('backpressure_drop');
              } catch {
                // ignore
              }
              try {
                res.end();
              } catch {
                // ignore
              }
              return undefined;
            }
          }
        }
      } catch (err) {
        log?.warn?.('[realtime] Catch-up replay failed', {
          userId,
          requestId,
          error: err?.message || String(err),
        });
      }
    }

    // Register after catch-up to avoid duplicate delivery during replay.
    sseManager.addClient(userId, res);

    // Cleanup on disconnect.
    req.on('close', () => {
      sseManager.removeClient(userId, res, 'client_close');
    });

    // Stream-level errors should drop the connection.
    try {
      res.on('error', () => {
        sseManager.removeClient(userId, res, 'error');
      });
    } catch {
      // ignore
    }

    // Emit an initial event to confirm stream health.
    const connectedId = (typeof require('crypto').randomUUID === 'function') ? require('crypto').randomUUID() : `${Date.now()}`;
    const connectedPayload = { eventId: connectedId, connected: true, updatedAt: new Date().toISOString() };
    res.write(formatSseEvent({ eventName: 'connected', eventId: connectedId, data: connectedPayload }));

    try {
      log?.info?.('[realtime] SSE client connected', { userId, requestId, since: since || undefined });
    } catch {
      // ignore
    }

    return undefined;
  };
}

module.exports = function createEventsRouter(options = {}) {
  const authenticateToken = options.authenticateToken || defaultAuthenticateToken;
  const sseManager = options.sseManager || createSseManager({ metrics });
  const log = options.logger || logger;
  const m = options.metrics || metrics;

  const photoEventHistory = options.photoEventHistory || createPhotoEventHistory({
    redis: getRedisClient(),
    ttlSeconds: Number(process.env.REALTIME_HISTORY_TTL_SECONDS || 600),
    maxEntries: Number(process.env.REALTIME_HISTORY_MAX_ENTRIES || 200),
    maxReplay: Number(process.env.REALTIME_HISTORY_MAX_REPLAY || 200),
    logger: log,
  });

  const router = express.Router();
  router.get(
    '/photos',
    instrumentAuthMiddleware(authenticateToken, { metrics: m }),
    createPhotosEventsHandler({ sseManager, photoEventHistory, log, metrics: m })
  );

  return router;
};

module.exports.__private__ = {
  createPhotosEventsHandler,
};
