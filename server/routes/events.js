const express = require('express');
const { authenticateToken: defaultAuthenticateToken } = require('../middleware/auth');
const { createSseManager, formatSseEvent } = require('../realtime/sseManager');

function createPhotosEventsHandler({ sseManager }) {
  if (!sseManager) throw new Error('sseManager is required');

  return (req, res) => {
    const userId = req.user && req.user.id ? String(req.user.id) : null;

    if (!userId) {
      return res.status(500).json({ success: false, error: 'Authenticated user missing' });
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

    // Register the client first so cleanup is guaranteed.
    sseManager.addClient(userId, res);

    // Cleanup on disconnect.
    req.on('close', () => {
      sseManager.removeClient(userId, res);
    });

    // Optional: emit an initial connected event to confirm stream health.
    const connectedId = (typeof require('crypto').randomUUID === 'function') ? require('crypto').randomUUID() : `${Date.now()}`;
    const connectedPayload = { eventId: connectedId, connected: true, updatedAt: new Date().toISOString() };
    res.write(formatSseEvent({ eventName: 'connected', eventId: connectedId, data: connectedPayload }));

    return undefined;
  };
}

module.exports = function createEventsRouter(options = {}) {
  const authenticateToken = options.authenticateToken || defaultAuthenticateToken;
  const sseManager = options.sseManager || createSseManager();

  const router = express.Router();
  router.get('/photos', authenticateToken, createPhotosEventsHandler({ sseManager }));

  return router;
};

module.exports.__private__ = {
  createPhotosEventsHandler,
};
