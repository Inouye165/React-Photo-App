const { randomUUID } = require('crypto');

function defaultGenerateId() {
  if (typeof randomUUID === 'function') return randomUUID();
  // Fallback: not cryptographically strong, but sufficient for Phase 1 unit tests.
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

  // SSE spec: lines end with \n and each event ends with a blank line.
  return `event: ${eventName}\n` + `id: ${eventId}\n` + `data: ${payload}\n\n`;
}

function createSseManager(options = {}) {
  const heartbeatMs = Number.isFinite(options.heartbeatMs) ? options.heartbeatMs : 25_000;
  const maxConnectionsPerUser = Number.isFinite(options.maxConnectionsPerUser) ? options.maxConnectionsPerUser : 3;
  const generateId = typeof options.generateId === 'function' ? options.generateId : defaultGenerateId;

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
      res.write(chunk);
      return true;
    } catch {
      return false;
    }
  }

  function addClient(userId, res) {
    const key = String(userId);
    if (!canAcceptClient(key)) {
      return { ok: false, reason: 'connection_cap' };
    }

    const record = { res, heartbeat: null };

    if (!clientsByUserId.has(key)) {
      clientsByUserId.set(key, new Set());
    }
    clientsByUserId.get(key).add(record);

    if (heartbeatMs > 0) {
      record.heartbeat = setInterval(() => {
        // SSE comment heartbeat (keeps proxies from closing idle connection)
        const ok = writeToRes(res, `: ping\n\n`);
        if (!ok) {
          removeClient(key, res);
        }
      }, heartbeatMs);

      // Don't keep the event loop alive in tests.
      if (record.heartbeat && typeof record.heartbeat.unref === 'function') {
        record.heartbeat.unref();
      }
    }

    return { ok: true };
  }

  function removeClient(userId, res) {
    const key = String(userId);
    const set = clientsByUserId.get(key);
    if (!set || set.size === 0) return;

    for (const record of set) {
      if (record.res === res) {
        if (record.heartbeat) {
          clearInterval(record.heartbeat);
          record.heartbeat = null;
        }
        set.delete(record);
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

    const eventId = generateId();
    const data = (payload && typeof payload === 'object') ? { ...payload, eventId } : { eventId, payload };
    const frame = formatSseEvent({ eventName, eventId, data });

    let delivered = 0;
    for (const record of Array.from(set)) {
      const ok = writeToRes(record.res, frame);
      if (!ok) {
        removeClient(key, record.res);
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
    // For introspection/testing
    _getAllUserIds: () => Array.from(clientsByUserId.keys()),
  };
}

module.exports = {
  createSseManager,
  formatSseEvent,
};
