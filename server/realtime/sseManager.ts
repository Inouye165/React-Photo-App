// @ts-nocheck

const { randomUUID } = require('crypto');

function defaultGenerateId() {
  if (typeof randomUUID === 'function') return randomUUID();
  // Fallback for environments without crypto.randomUUID.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatSseEvent({ eventName, eventId, data }) {
  if (!eventName || typeof eventName !== 'string') {
    throw new Error('eventName is required');
  }
  if (!eventId || typeof eventId !== 'string') {
    throw new Error('eventId is required');
  }

  const payload = typeof data === 'string' ? data : JSON.stringify(data ?? {});

  // SSE framing: each field is a line; blank line terminates the event.
  return `event: ${eventName}\n` + `id: ${eventId}\n` + `data: ${payload}\n\n`;
}

function createSseManager(options = {}) {
  const heartbeatMs = Number.isFinite(options.heartbeatMs) ? options.heartbeatMs : 25_000;
  const maxConnectionsPerUser = Number.isFinite(options.maxConnectionsPerUser) ? options.maxConnectionsPerUser : 3;
  const generateId = typeof options.generateId === 'function' ? options.generateId : defaultGenerateId;
  const maxBufferedBytes = Number.isFinite(options.maxBufferedBytes) ? options.maxBufferedBytes : 64 * 1024;
  const metrics = options.metrics || null;

  /** @type {Map<string, Set<{ res: any, heartbeat: NodeJS.Timeout | null }>>} */
  const clientsByUserId = new Map();

  function getUserClientCount(userId) {
    const set = clientsByUserId.get(String(userId));
    return set ? set.size : 0;
  }

  function canAcceptClient(userId) {
    return getUserClientCount(userId) < maxConnectionsPerUser;
  }

  function writeToRes(res, chunk) {
    try {
      const ok = res.write(chunk);

      // Node streams signal backpressure by returning false.
      if (ok === false) return { ok: false, reason: 'backpressure_drop' };

      // Drop if the writable buffer keeps growing (slow client).
      const buffered = typeof res?.writableLength === 'number' ? res.writableLength : null;
      if (buffered !== null && buffered > maxBufferedBytes) {
        return { ok: false, reason: 'backpressure_drop' };
      }

      return { ok: true };
    } catch {
      return { ok: false, reason: 'error' };
    }
  }

  function addClient(userId, res) {
    const key = String(userId);
    if (!canAcceptClient(key)) {
      return { ok: false, reason: 'connection_cap' };
    }

    const record = { res, heartbeat: null, closed: false };

    if (!clientsByUserId.has(key)) {
      clientsByUserId.set(key, new Set());
    }
    clientsByUserId.get(key).add(record);

    if (metrics && typeof metrics.incRealtimeConnect === 'function') {
      try {
        metrics.incRealtimeConnect();
      } catch {
        // ignore metrics errors
      }
    }
    if (metrics && typeof metrics.setRealtimeActiveConnections === 'function') {
      try {
        metrics.setRealtimeActiveConnections(totalClientCount());
      } catch {
        // ignore
      }
    }

    if (heartbeatMs > 0) {
      record.heartbeat = setInterval(() => {
        // SSE comment heartbeat (keeps proxies from closing idle connections).
        const out = writeToRes(res, `: ping\n\n`);
        if (!out.ok) {
          removeClient(key, res, out.reason);
        }
      }, heartbeatMs);

      // Don't keep the event loop alive in tests.
      if (record.heartbeat && typeof record.heartbeat.unref === 'function') {
        record.heartbeat.unref();
      }
    }

    return { ok: true };
  }

  function totalClientCount() {
    let n = 0;
    for (const set of clientsByUserId.values()) n += set.size;
    return n;
  }

  function removeClient(userId, res, reason) {
    const key = String(userId);
    const set = clientsByUserId.get(key);
    if (!set || set.size === 0) return;

    for (const record of set) {
      if (record.res === res) {
        if (record.closed) {
          return;
        }
        record.closed = true;
        if (record.heartbeat) {
          clearInterval(record.heartbeat);
          record.heartbeat = null;
        }
        set.delete(record);

        // End the response so Node stops buffering.
        try {
          if (typeof res?.end === 'function') res.end();
        } catch {
          // ignore
        }

        if (metrics && typeof metrics.incRealtimeDisconnect === 'function') {
          try {
            metrics.incRealtimeDisconnect();
          } catch {
            // ignore
          }
        }
        if (metrics && typeof metrics.incRealtimeDisconnectReason === 'function') {
          try {
            metrics.incRealtimeDisconnectReason(reason || 'client_close');
          } catch {
            // ignore
          }
        }
        if (metrics && typeof metrics.setRealtimeActiveConnections === 'function') {
          try {
            metrics.setRealtimeActiveConnections(totalClientCount());
          } catch {
            // ignore
          }
        }
        break;
      }
    }

    if (set.size === 0) {
      clientsByUserId.delete(key);
    }
  }

  function publishToUser(userId, eventName, payload) {
    const key = String(userId);
    const set = clientsByUserId.get(key);
    if (!set || set.size === 0) return { delivered: 0 };

    const upstreamEventId = payload && typeof payload === 'object' ? payload.eventId : null;
    const eventId = (typeof upstreamEventId === 'string' && upstreamEventId.trim()) ? upstreamEventId : generateId();
    const data = (payload && typeof payload === 'object') ? { ...payload, eventId } : { eventId, payload };
    const frame = formatSseEvent({ eventName, eventId, data });

    let delivered = 0;
    for (const record of Array.from(set)) {
      const out = writeToRes(record.res, frame);
      if (!out.ok) {
        removeClient(key, record.res, out.reason);
        continue;
      }
      delivered += 1;
    }

    return { delivered, eventId };
  }

  return {
    addClient,
    removeClient,
    publishToUser,
    canAcceptClient,
    getUserClientCount,
    formatSseEvent,
    // Test helper.
    _getAllUserIds: () => Array.from(clientsByUserId.keys()),
  };
}

module.exports = {
  createSseManager,
  formatSseEvent,
};
