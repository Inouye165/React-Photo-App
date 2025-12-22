const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const logger = require('../logger');
const { createRedisConnection } = require('../redis/connection');

let cachedStore;
let warned = false;

function warnOnce(err) {
  if (warned) return;
  warned = true;
  const msg = err?.message || String(err);
  logger.warn(`[RATE_LIMIT] Redis store unavailable; falling back to memory: ${msg}`);
}

/**
 * Returns a Redis-backed store when REDIS_URL is configured and not running in
 * the test environment. If Redis initialization or operations fail, it falls
 * back to an in-memory store to avoid changing route behavior.
 */
function getRateLimitStore() {
  if (cachedStore !== undefined) return cachedStore;

  const url = process.env.REDIS_URL;
  const isTestEnv = process.env.NODE_ENV === 'test';
  if (!url || isTestEnv) {
    cachedStore = undefined;
    return undefined;
  }

  try {
    const redisConnection = createRedisConnection();

    const redisStore = new RedisStore({
      sendCommand: (command, ...args) => redisConnection.call(command, ...args),
    });

    const memoryStore = new rateLimit.MemoryStore();

    cachedStore = {
      localKeys: false,
      prefix: redisStore.prefix,

      init: (options) => {
        try {
          redisStore.init?.(options);
        } catch (err) {
          warnOnce(err);
        }

        try {
          memoryStore.init?.(options);
        } catch {
          // ignore
        }
      },

      get: async (key) => {
        try {
          if (redisStore.get) return await redisStore.get(key);
        } catch (err) {
          warnOnce(err);
        }

        return memoryStore.get ? memoryStore.get(key) : undefined;
      },

      increment: async (key) => {
        try {
          return await redisStore.increment(key);
        } catch (err) {
          warnOnce(err);
          return memoryStore.increment(key);
        }
      },

      decrement: async (key) => {
        try {
          return await redisStore.decrement(key);
        } catch (err) {
          warnOnce(err);
          return memoryStore.decrement(key);
        }
      },

      resetKey: async (key) => {
        try {
          return await redisStore.resetKey(key);
        } catch (err) {
          warnOnce(err);
          return memoryStore.resetKey(key);
        }
      },

      resetAll: async () => {
        try {
          return await redisStore.resetAll?.();
        } catch (err) {
          warnOnce(err);
          return memoryStore.resetAll?.();
        }
      },

      shutdown: async () => {
        try {
          await redisStore.shutdown?.();
        } catch (err) {
          warnOnce(err);
        }

        try {
          await memoryStore.shutdown?.();
        } catch {
          // ignore
        }
      },
    };
  } catch (err) {
    warnOnce(err);
    cachedStore = undefined;
  }

  return cachedStore;
}

module.exports = { getRateLimitStore };
