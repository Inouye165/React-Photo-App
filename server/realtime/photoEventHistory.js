const logger = require('../logger');

const DEFAULT_TTL_SECONDS = 10 * 60; // 10 minutes
const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_MAX_REPLAY = 200;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function toUserKey(userId) {
  return `realtime:photo:events:${String(userId)}`;
}

function parseTimestampMs(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

  const s = String(raw).trim();
  if (!s) return null;

  // Numeric timestamp: allow seconds or milliseconds.
  if (/^\d{9,17}$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    if (n > 10_000_000_000) return Math.floor(n); // ms
    return Math.floor(n * 1000); // seconds
  }

  // ISO timestamp.
  const t = Date.parse(s);
  if (Number.isFinite(t)) return t;
  return null;
}

function parseSinceParam(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const asTs = parseTimestampMs(s);
  if (asTs !== null) return { kind: 'timestamp', value: asTs };

  return { kind: 'eventId', value: s };
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeEventPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const userId = payload.userId != null ? String(payload.userId) : '';
  const eventId = payload.eventId != null ? String(payload.eventId) : '';
  const photoId = payload.photoId != null ? String(payload.photoId) : '';
  const status = payload.status;
  const updatedAt = payload.updatedAt != null ? String(payload.updatedAt) : '';
  const progress = payload.progress;

  if (!isNonEmptyString(userId)) return null;
  if (!isNonEmptyString(eventId)) return null;
  if (!isNonEmptyString(photoId)) return null;
  if (!isNonEmptyString(updatedAt)) return null;
  if (status !== 'queued' && status !== 'processing' && status !== 'finished' && status !== 'failed') return null;

  const ts = parseTimestampMs(updatedAt) ?? Date.now();

  const out = { userId, eventId, photoId, status, updatedAt, ts };
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    out.progress = progress;
  }
  return out;
}

function createPhotoEventHistory(options = {}) {
  const redis = options.redis || null;
  const ttlSeconds = Number.isFinite(options.ttlSeconds) ? options.ttlSeconds : DEFAULT_TTL_SECONDS;
  const maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : DEFAULT_MAX_ENTRIES;
  const maxReplay = Number.isFinite(options.maxReplay) ? options.maxReplay : DEFAULT_MAX_REPLAY;
  const log = options.logger || logger;

  async function append(rawPayload) {
    if (!redis) return { ok: false, reason: 'no_redis' };

    const payload = normalizeEventPayload(rawPayload);
    if (!payload) return { ok: false, reason: 'invalid_payload' };

    const key = toUserKey(payload.userId);
    const item = JSON.stringify(payload);

    try {
      if (typeof redis.multi === 'function') {
        await redis
          .multi()
          .lpush(key, item)
          .ltrim(key, 0, Math.max(0, maxEntries - 1))
          .expire(key, ttlSeconds)
          .exec();
      } else {
        await redis.lpush(key, item);
        await redis.ltrim(key, 0, Math.max(0, maxEntries - 1));
        await redis.expire(key, ttlSeconds);
      }
      return { ok: true };
    } catch (err) {
      log.warn('[realtime] Failed to append photo event history', {
        userId: payload.userId,
        photoId: payload.photoId,
        eventId: payload.eventId,
        error: err?.message || String(err),
      });
      return { ok: false, reason: 'redis_error' };
    }
  }

  async function getCatchupEvents({ userId, since }) {
    if (!redis) return { ok: false, events: [], reason: 'no_redis' };
    if (!isNonEmptyString(String(userId))) return { ok: false, events: [], reason: 'no_userId' };

    const key = toUserKey(String(userId));
    const parsedSince = parseSinceParam(since);

    let raw;
    try {
      raw = await redis.lrange(key, 0, Math.max(0, maxEntries - 1));
    } catch (err) {
      log.warn('[realtime] Failed to read photo event history', {
        userId: String(userId),
        error: err?.message || String(err),
      });
      return { ok: false, events: [], reason: 'redis_error' };
    }

    const parsed = [];
    for (const s of raw || []) {
      const item = safeJsonParse(String(s));
      if (!item || typeof item !== 'object') continue;
      if (!isNonEmptyString(item.eventId) || !isNonEmptyString(item.photoId) || !isNonEmptyString(item.updatedAt)) continue;
      const ts = Number.isFinite(Number(item.ts)) ? Number(item.ts) : (parseTimestampMs(item.updatedAt) ?? null);
      if (ts === null) continue;
      parsed.push({ ...item, ts });
    }

    // Convert to chronological order (oldest -> newest).
    parsed.sort((a, b) => a.ts - b.ts);

    let filtered;
    if (!parsedSince) {
      filtered = parsed;
    } else if (parsedSince.kind === 'timestamp') {
      const cutoff = parsedSince.value;
      filtered = parsed.filter((e) => e.ts > cutoff);
    } else {
      const idx = parsed.findIndex((e) => String(e.eventId) === parsedSince.value);
      filtered = idx === -1 ? parsed : parsed.slice(idx + 1);
    }

    if (filtered.length > maxReplay) {
      filtered = filtered.slice(filtered.length - maxReplay);
    }

    return { ok: true, events: filtered };
  }

  return {
    append,
    getCatchupEvents,
    __private__: {
      parseSinceParam,
      parseTimestampMs,
      normalizeEventPayload,
      toUserKey,
    },
  };
}

module.exports = {
  createPhotoEventHistory,
};
