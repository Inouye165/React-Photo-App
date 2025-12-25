const { createRedisConnection } = require('../redis/connection');
const logger = require('../logger');

let redisClient = null;

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

module.exports = { getRedisClient };
