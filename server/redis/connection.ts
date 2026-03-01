// @ts-nocheck

const IORedis = require("ioredis");

function createRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");

  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // Fail fast when Redis is unreachable so API endpoints don't hang.
    connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000),
  });
}

module.exports = { createRedisConnection };
