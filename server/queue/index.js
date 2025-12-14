// server/queue/index.js
const { Queue, Worker: BullMQWorker } = require("bullmq");
const logger = require("../logger");
const { createRedisConnection } = require("../redis/connection");

const QUEUE_NAME = "ai-processing";

// Internal state (lazy init)
let redisConnection = null;
let aiQueue = null;
let aiWorker = null;
let redisAvailable = false;
let initializationPromise = null;

async function initializeQueue() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      // Create connection lazily so missing REDIS_URL doesn't crash module import (CI/tests).
        redisConnection = createRedisConnection(); // Create connection lazily

      // Force an auth/connection check up front.
      await redisConnection.ping();

      aiQueue = new Queue(QUEUE_NAME, { connection: redisConnection });
      redisAvailable = true;

      logger.info("[QUEUE] Redis connected");
    } catch (err) {
      const msg = err?.message || String(err);
      logger.warn(`[QUEUE] Redis unavailable; queue disabled: ${msg}`);

      redisAvailable = false;
      aiQueue = null;
      aiWorker = null;

      // Best-effort cleanup if we partially created a client.
      try {
        redisConnection?.disconnect?.();
      } catch {
        // ignore
      }
      redisConnection = null;
    }
  })();

  return initializationPromise;
}

async function checkRedisAvailable() {
  await initializeQueue();
  return redisAvailable;
}

const addAIJob = async (photoId, options = {}) => {
  await initializeQueue();

  if (!redisAvailable || !aiQueue) {
    throw new Error("Queue service unavailable - Redis connection required");
  }

  const jobData = { photoId };

  // Back-compat: some callers used `models` instead of `modelOverrides`.
  const overrides = options.modelOverrides ?? options.models;
  if (overrides) jobData.modelOverrides = overrides;

  if (options.processMetadata !== undefined) jobData.processMetadata = options.processMetadata;
  if (options.generateThumbnail !== undefined) jobData.generateThumbnail = options.generateThumbnail;

  return aiQueue.add("process-photo-ai", jobData);
};

const startWorker = async () => {
  await initializeQueue();

  if (!redisAvailable || !redisConnection) {
    throw new Error("Redis connection required to start worker");
  }

  if (!aiWorker) {
    const db = require("../db");
    const { updatePhotoAIMetadata } = require("../ai/service");
    const { processUploadedPhoto } = require("../media/backgroundProcessor");

    const processor = async (job) => {
      const { photoId, modelOverrides, processMetadata, generateThumbnail } = job.data || {};
      logger.info(`[WORKER] Processing job for photoId: ${photoId}`);

      const photo = await db("photos").where({ id: photoId }).first();
      if (!photo) throw new Error(`Photo with ID ${photoId} not found.`);

      const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;

      // Optional background steps for streaming uploads.
      if (processMetadata || generateThumbnail) {
        await processUploadedPhoto(db, photoId, {
          processMetadata: processMetadata !== false,
          generateThumbnail: generateThumbnail !== false,
        });
      }

      await updatePhotoAIMetadata(db, photo, storagePath, modelOverrides);
      logger.info(`[WORKER] Done photoId: ${photoId}`);
    };

    aiWorker = new BullMQWorker(QUEUE_NAME, processor, {
      connection: redisConnection,
      lockDuration: 300000,
      concurrency: 2,
      attempts: 3,
      backoff: { type: "exponential", delay: 60000 },
    });

    aiWorker.on("completed", (job) =>
      logger.info(`[WORKER] Job ${job.id} (PhotoId: ${job.data.photoId}) completed.`)
    );
    aiWorker.on("failed", (job, err) =>
      logger.warn(`[WORKER] Job ${job?.id} failed: ${err?.message || err}`)
    );

    logger.info("[WORKER] Started and listening for jobs");
  }

  return { aiWorker, redisAvailable };
};

module.exports = {
  addAIJob,
  startWorker,
  checkRedisAvailable,
};

// Export live views (prevents “stale null” exports after lazy init)
Object.defineProperties(module.exports, {
  aiQueue: { enumerable: true, get: () => aiQueue },
  aiWorker: { enumerable: true, get: () => aiWorker },
  redisAvailable: { enumerable: true, get: () => redisAvailable },
});
