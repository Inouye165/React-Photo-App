const express = require('express');
const { authenticateToken: defaultAuthenticateToken } = require('../middleware/auth');
const metrics = require('../metrics');
const logger = require('../logger');
const { getOrCreateRequestId } = require('../validation/validateRequest');

function isRealtimeDisabled() {
  const v = String(process.env.REALTIME_EVENTS_DISABLED || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
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

function createPhotosEventsHandler({ log, metrics: m }) {
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

    try {
      log?.info?.('[realtime] WebSocket upgrade required', { userId, requestId });
    } catch {
      // ignore
    }

    return res.status(426).json({
      success: false,
      error: 'WebSocket upgrade required',
      requestId,
    });
  };
}

module.exports = function createEventsRouter(options = {}) {
  const authenticateToken = options.authenticateToken || defaultAuthenticateToken;
  const log = options.logger || logger;
  const m = options.metrics || metrics;

  const router = express.Router();
  router.get(
    '/photos',
    instrumentAuthMiddleware(authenticateToken, { metrics: m }),
    createPhotosEventsHandler({ log, metrics: m })
  );

  return router;
};

module.exports.__private__ = {
  createPhotosEventsHandler,
};
