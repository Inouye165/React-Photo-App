const { createRedisConnection: defaultCreateRedisConnection } = require('../redis/connection');
const logger = require('../logger');

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
  const sseManager = options.sseManager;
  if (!sseManager || typeof sseManager.publishToUser !== 'function') {
    throw new Error('sseManager with publishToUser is required');
  }

  const createRedisConnection = options.createRedisConnection || defaultCreateRedisConnection;
  const log = options.logger || logger;

  let subscriber = null;
  let startPromise = null;

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
        // Log but never crash the API server.
        log.error('[realtime] Redis subscriber error', err);
      });

      subscriber.on('message', (channel, message) => {
        if (channel !== CHANNEL) return;

        const payload = parseAndValidateMessage(message);
        if (!payload) {
          // Malformed or incomplete payload; ignore.
          return;
        }

        // SECURITY: per-user publish only; never broadcast.
        try {
          sseManager.publishToUser(payload.userId, EVENT_NAME, payload);
          log.info('[realtime] Forwarded photo status event', {
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
    // If a start is in flight, wait for it so we can unsubscribe/quit safely.
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
