const { createRedisConnection } = require('../redis/connection');
const logger = require('../logger');

let redisClient = null;

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

module.exports = { getRedisClient, setRedisValueWithTtl };
