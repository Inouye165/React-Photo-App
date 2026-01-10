const { createRedisConnection } = require('../redis/connection');
const logger = require('../logger');
const crypto = require('crypto');

let redisClient = null;

function normalizeCacheUserId(userId) {
  const raw = typeof userId === 'string' ? userId.trim() : String(userId || '');
  const lower = raw.toLowerCase();
  // Supabase UUID format (same as used across the codebase)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRe.test(lower)) return lower;
  // Defensive fallback: avoid putting untrusted/raw identifiers into Redis keys.
  return `u_${crypto.createHash('sha256').update(lower).digest('hex').slice(0, 16)}`;
}

async function saddCompat(client, key, member) {
  if (!client) return;
  if (typeof client.sadd === 'function') return client.sadd(key, member);
  if (typeof client.sAdd === 'function') return client.sAdd(key, member);
  throw new Error('Redis client does not support SADD (sadd/sAdd)');
}

async function smembersCompat(client, key) {
  if (!client) return [];
  if (typeof client.smembers === 'function') return client.smembers(key);
  if (typeof client.sMembers === 'function') return client.sMembers(key);
  throw new Error('Redis client does not support SMEMBERS (smembers/sMembers)');
}

async function expireCompat(client, key, seconds) {
  if (!client) return;
  if (typeof client.expire === 'function') return client.expire(key, seconds);
  throw new Error('Redis client does not support EXPIRE');
}

async function delCompat(client, keys) {
  if (!client) return 0;
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!list.length) return 0;
  if (typeof client.del === 'function') return client.del(...list);
  throw new Error('Redis client does not support DEL');
}

async function runMultiCompat(client, operations) {
  if (!client) return false;
  if (typeof client.multi !== 'function') return false;

  try {
    const multi = client.multi();
    if (!multi) return false;
    for (const op of operations) {
      const fn = multi[op.name];
      if (typeof fn !== 'function') return false;
      fn.apply(multi, op.args);
    }
    if (typeof multi.exec !== 'function') return false;
    await multi.exec();
    return true;
  } catch {
    return false;
  }
}

function photosListKeysIndexKey(userId) {
  const userKey = normalizeCacheUserId(userId);
  return `photos:list:keys:${userKey}`;
}

function authProfileKeysIndexKey(userId) {
  const userKey = normalizeCacheUserId(userId);
  return `auth:profile:keys:${userKey}`;
}

function authProfileInvalidatedAtKey(userId) {
  const userKey = normalizeCacheUserId(userId);
  return `auth:profile:invalidatedAt:${userKey}`;
}

async function recordAuthProfileCacheKeyForUserId(userId, cacheKey, ttlSeconds, { redis } = {}) {
  const client = redis || getRedisClient();
  if (!client) return { ok: false, reason: 'redis-not-configured' };
  if (!cacheKey || typeof cacheKey !== 'string') return { ok: false, reason: 'invalid-cacheKey' };

  const indexKey = authProfileKeysIndexKey(userId);
  const ttl = Number(ttlSeconds);
  const seconds = Number.isFinite(ttl) && ttl > 0 ? Math.max(1, Math.floor(ttl)) : 300;

  try {
    await saddCompat(client, indexKey, cacheKey);
    await expireCompat(client, indexKey, seconds);
    return { ok: true };
  } catch (err) {
    logger.warn('[Redis] auth:profile index update failed', {
      error: err instanceof Error ? err.message : String(err),
      userId: typeof userId === 'string' ? userId : String(userId),
    });
    return { ok: false, reason: 'redis-error' };
  }
}

async function getAuthProfileInvalidatedAtMs(userId, { redis } = {}) {
  const client = redis || getRedisClient();
  if (!client || typeof client.get !== 'function') return null;

  try {
    const raw = await client.get(authProfileInvalidatedAtKey(userId));
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort invalidation for all cached auth profiles for a user.
 *
 * Intended for security-sensitive events (role changes, revocation, etc.).
 * Uses a per-user Redis Set index + an invalidatedAt timestamp guard.
 */
async function invalidateAuthProfileCacheForUserId(userId, { redis } = {}) {
  const client = redis || getRedisClient();
  if (!client) return { ok: false, reason: 'redis-not-configured', keysDeleted: 0 };

  const indexKey = authProfileKeysIndexKey(userId);
  const invalidatedKey = authProfileInvalidatedAtKey(userId);
  const nowMs = Date.now();

  // Keep invalidation guards around longer than the profile TTL so late/straggler
  // caches don't resurrect old auth state.
  const invalidateTtlSeconds = 86400;

  try {
    const keys = await smembersCompat(client, indexKey);
    const toDelete = Array.isArray(keys) ? keys.filter((k) => typeof k === 'string' && k) : [];

    // Write the invalidation guard first (best effort).
    try {
      await setRedisValueWithTtl(client, invalidatedKey, invalidateTtlSeconds, String(nowMs));
    } catch {
      // Fail-open: cache invalidation should never block the caller.
    }

    // Prefer MULTI/EXEC when available.
    const usedMulti = await runMultiCompat(client, [
      ...(toDelete.length ? [{ name: 'del', args: toDelete }] : []),
      { name: 'del', args: [indexKey] },
    ]);

    if (!usedMulti) {
      if (toDelete.length) await delCompat(client, toDelete);
      await delCompat(client, [indexKey]);
    }

    return { ok: true, keysDeleted: toDelete.length, invalidatedAtMs: nowMs };
  } catch (err) {
    logger.warn('[Redis] auth:profile invalidation failed', {
      error: err instanceof Error ? err.message : String(err),
      userId: typeof userId === 'string' ? userId : String(userId),
    });
    return { ok: false, reason: 'redis-error', keysDeleted: 0 };
  }
}

/**
 * Best-effort invalidation for all cached photo listing results for a user.
 *
 * Uses a per-user Redis Set index to avoid KEYS/SCAN in the hot path.
 * Gracefully degrades (no-throw) if Redis is unavailable.
 */
async function invalidatePhotosListCacheForUserId(userId, { redis } = {}) {
  const client = redis || getRedisClient();
  if (!client) return { ok: false, reason: 'redis-not-configured', keysDeleted: 0 };

  const indexKey = photosListKeysIndexKey(userId);

  try {
    const keys = await smembersCompat(client, indexKey);
    const toDelete = Array.isArray(keys) ? keys.filter((k) => typeof k === 'string' && k) : [];

    // Prefer MULTI/EXEC when available.
    const usedMulti = await runMultiCompat(client, [
      ...(toDelete.length ? [{ name: 'del', args: toDelete }] : []),
      { name: 'del', args: [indexKey] },
    ]);

    if (!usedMulti) {
      if (toDelete.length) await delCompat(client, toDelete);
      await delCompat(client, [indexKey]);
    }

    return { ok: true, keysDeleted: toDelete.length };
  } catch (err) {
    logger.warn('[Redis] photos:list invalidation failed', {
      error: err instanceof Error ? err.message : String(err),
      userId: typeof userId === 'string' ? userId : String(userId),
    });
    return { ok: false, reason: 'redis-error', keysDeleted: 0 };
  }
}

async function setRedisValueWithTtl(client, key, ttlSeconds, value) {
  if (!client) return false;
  if (!key) return false;

  const ttl = Number(ttlSeconds);
  if (!Number.isFinite(ttl) || ttl <= 0) return false;
  const seconds = Math.max(1, Math.floor(ttl));

  // ioredis: setex(key, seconds, value)
  if (typeof client.setex === 'function') {
    await client.setex(key, seconds, value);
    return true;
  }

  // node-redis v4: setEx(key, seconds, value)
  if (typeof client.setEx === 'function') {
    await client.setEx(key, seconds, value);
    return true;
  }

  // v4-standard SET with options object.
  if (typeof client.set === 'function') {
    try {
      await client.set(key, value, { EX: seconds });
      return true;
    } catch {
      // ioredis and some legacy clients use variadic args: set(key, value, 'EX', seconds)
      await client.set(key, value, 'EX', seconds);
      return true;
    }
  }

  throw new Error('Redis client does not support TTL writes (setex/setEx/set)');
}

/**
 * Get a shared Redis client instance.
 * Returns null if REDIS_URL is not configured.
 * Handles connection errors gracefully.
 */
function getRedisClient() {
  if (redisClient) return redisClient;

  if (!process.env.REDIS_URL) {
    return null;
  }

  try {
    redisClient = createRedisConnection();
    
    // Handle runtime errors to prevent crashing the process
    redisClient.on('error', (err) => {
      // Log but don't crash - the app should degrade gracefully
      logger.error('[Redis] Client error', err);
    });

    return redisClient;
  } catch (err) {
    logger.error('[Redis] Failed to initialize client', err);
    return null;
  }
}

module.exports = {
  getRedisClient,
  setRedisValueWithTtl,
  normalizeCacheUserId,
  photosListKeysIndexKey,
  authProfileKeysIndexKey,
  authProfileInvalidatedAtKey,
  recordAuthProfileCacheKeyForUserId,
  getAuthProfileInvalidatedAtMs,
  invalidateAuthProfileCacheForUserId,
  invalidatePhotosListCacheForUserId,
  // Intentionally exported for compatibility across redis client implementations.
  // Keep these helpers internal-ish; tests can mock around them.
  _compat: {
    saddCompat,
    smembersCompat,
    expireCompat,
    delCompat,
    runMultiCompat,
  },
};
