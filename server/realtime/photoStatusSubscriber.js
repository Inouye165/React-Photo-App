const { createRedisConnection: defaultCreateRedisConnection } = require('../redis/connection');
const logger = require('../logger');
const metrics = require('../metrics');
const { getRedisClient } = require('../lib/redis');
const { createPhotoEventHistory } = require('./photoEventHistory');

const CHANNEL = 'photo:status:v1';
const EVENT_NAME = 'photo.processing';

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidStatus(status) {
  return status === 'queued' || status === 'processing' || status === 'finished' || status === 'failed';
}

function parseAndValidateMessage(raw) {
  if (!isNonEmptyString(raw)) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const userId = parsed.userId != null ? String(parsed.userId) : '';
  const eventId = parsed.eventId != null ? String(parsed.eventId) : '';
  const photoId = parsed.photoId != null ? String(parsed.photoId) : '';
  const status = parsed.status;
  const updatedAt = parsed.updatedAt != null ? String(parsed.updatedAt) : '';
  const progress = parsed.progress;

  if (!isNonEmptyString(userId)) return null;
  if (!isNonEmptyString(eventId)) return null;
  if (!isNonEmptyString(photoId)) return null;
  if (!isNonEmptyString(updatedAt)) return null;
  if (!isValidStatus(status)) return null;

  const payload = { userId, eventId, photoId, status, updatedAt };
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    payload.progress = progress;
  }

  return payload;
}

function createPhotoStatusSubscriber(options = {}) {
  const socketManager = options.socketManager;
  if (!socketManager || typeof socketManager.publishToUser !== 'function') {
    throw new Error('socketManager with publishToUser is required');
  }

  const createRedisConnection = options.createRedisConnection || defaultCreateRedisConnection;
  const log = options.logger || logger;
  const m = options.metrics || metrics;
  const photoEventHistory = options.photoEventHistory || createPhotoEventHistory({
    redis: getRedisClient(),
    ttlSeconds: Number(process.env.REALTIME_HISTORY_TTL_SECONDS || 600),
    maxEntries: Number(process.env.REALTIME_HISTORY_MAX_ENTRIES || 200),
    maxReplay: Number(process.env.REALTIME_HISTORY_MAX_REPLAY || 200),
    logger: log,
  });

  let subscriber = null;
  let startPromise = null;
  let chain = Promise.resolve();

  function withTimeout(promise, timeoutMs, label) {
    const ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) return promise;
    let id;
    const timeoutPromise = new Promise((resolve) => {
      id = setTimeout(() => resolve({ ok: false, reason: `${label}_timeout` }), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      try {
        if (id) clearTimeout(id);
      } catch {
        // ignore
      }
    });
  }

  async function start() {
    if (subscriber) return { started: true, channel: CHANNEL };
    if (startPromise) return startPromise;

    if (!process.env.REDIS_URL) {
      log.info('[realtime] Redis not configured; photo status subscriber disabled');
      return { started: false, reason: 'no_redis_url' };
    }

    startPromise = (async () => {
      subscriber = createRedisConnection();

      subscriber.on('error', (err) => {
        // Log and continue; subscriber errors should not crash the API.
        log.error('[realtime] Redis subscriber error', err);
        try {
          m.incRealtimeRedisSubscribeError?.();
        } catch {
          // ignore
        }
      });

      const handleMessage = async (channel, message) => {
        if (channel !== CHANNEL) return;

        const payload = parseAndValidateMessage(message);
        if (!payload) {
          // Malformed or incomplete payload.
          return;
        }

        // Write to history before fanout; failures are non-fatal.
        try {
          await withTimeout(photoEventHistory.append(payload), Number(process.env.REALTIME_HISTORY_APPEND_TIMEOUT_MS || 75), 'history_append');
        } catch {
          // ignore
        }

        try {
          m.incRealtimeEventsPublished?.();
        } catch {
          // ignore
        }

        // Per-user publish only; never broadcast.
        try {
          socketManager.publishToUser(payload.userId, EVENT_NAME, payload);
          log.debug('[realtime] Forwarded photo status event', {
            userId: payload.userId,
            photoId: payload.photoId,
            status: payload.status,
            eventId: payload.eventId,
          });
        } catch (err) {
          log.error('[realtime] Failed to forward photo status event', {
            userId: payload.userId,
            photoId: payload.photoId,
            status: payload.status,
            eventId: payload.eventId,
            error: err?.message || String(err),
          });
        }
      };

      subscriber.on('message', (channel, message) => {
        // Preserve message ordering even if history writes are slow.
        chain = chain.then(() => handleMessage(channel, message)).catch(() => handleMessage(channel, message));
      });

      await subscriber.subscribe(CHANNEL);
      log.info('[realtime] Photo status subscriber started', { channel: CHANNEL });
      return { started: true, channel: CHANNEL };
    })().finally(() => {
      startPromise = null;
    });

    return startPromise;
  }

  async function stop() {
    // If a start is in flight, wait so unsubscribe/quit is safe.
    if (startPromise) {
      try {
        await startPromise;
      } catch {
        // ignore
      }
    }
    if (!subscriber) return;
    try {
      await subscriber.unsubscribe(CHANNEL);
    } catch {
      // ignore
    }
    try {
      // ioredis: quit() closes gracefully; disconnect() is immediate.
      if (typeof subscriber.quit === 'function') {
        await subscriber.quit();
      } else if (typeof subscriber.disconnect === 'function') {
        subscriber.disconnect();
      }
    } catch {
      // ignore
    }
    subscriber = null;
  }

  return { start, stop };
}

module.exports = {
  createPhotoStatusSubscriber,
  CHANNEL,
  EVENT_NAME,
  __private__: {
    parseAndValidateMessage,
    isValidStatus,
  },
};
