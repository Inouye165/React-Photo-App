// server/queue/index.js
const { Queue, Worker: BullMQWorker } = require("bullmq");
const path = require('path');
const logger = require("../logger");
const { createRedisConnection } = require("../redis/connection");
const metrics = require('../metrics');
const { attachBullmqWorkerMetrics } = require('../metrics/bullmq');

const QUEUE_NAME = "ai-processing";

// Internal state (lazy init)
let redisConnection = null;
let aiQueue = null;
let aiWorker = null;
let redisAvailable = false;
let initializationPromise = null;

function withTimeout(promise, timeoutMs, label = 'operation') {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let id;
  const timeoutPromise = new Promise((_, reject) => {
    id = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    try {
      if (id) clearTimeout(id);
    } catch {
      /* ignore */
    }
  });
}

async function initializeQueue() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      // Create connection lazily so missing REDIS_URL doesn't crash module import (CI/tests).
        redisConnection = createRedisConnection(); // Create connection lazily

      // Force an auth/connection check up front.
      const pingTimeoutMs = Number(process.env.REDIS_PING_TIMEOUT_MS || 2000);
      await withTimeout(redisConnection.ping(), pingTimeoutMs, 'Redis ping');

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
    const supabase = require('../lib/supabaseClient');
    const createPhotosStorage = require('../services/photosStorage');
    const createPhotosState = require('../services/photosState');

    const photosStorage = createPhotosStorage({ storageClient: supabase.storage.from('photos') });
    const photosState = createPhotosState({ db, storage: photosStorage });

    const AI_MAX_RETRIES = 5;

    async function setPhotoStateFallback(photoId, state) {
      await db('photos').where({ id: photoId }).update({
        state,
        state_transition_status: 'IDLE',
        updated_at: new Date().toISOString(),
      });
    }

    const processor = async (job) => {
      const { photoId, modelOverrides, processMetadata, generateThumbnail } = job.data || {};
      logger.info(`[WORKER] Processing job for photoId: ${photoId}`);

      const photo = await db("photos").where({ id: photoId }).first();
      if (!photo) throw new Error(`Photo with ID ${photoId} not found.`);

      const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;

      try {
        // Optional background steps for streaming uploads.
        if (processMetadata || generateThumbnail) {
          await processUploadedPhoto(db, photoId, {
            processMetadata: processMetadata !== false,
            generateThumbnail: generateThumbnail !== false,
          });
        }

        const aiResult = await updatePhotoAIMetadata(db, photo, storagePath, modelOverrides);

        if (!aiResult) {
          const fresh = await db('photos').where({ id: photoId }).select('ai_retry_count').first();
          const retries = Number(fresh?.ai_retry_count) || 0;

          if (retries >= AI_MAX_RETRIES) {
            logger.warn(`[WORKER] AI permanent failure for photoId: ${photoId}; marking state=error`);
            try {
              // Best-effort: storage move is not required to prevent UI from being stuck.
              await setPhotoStateFallback(photoId, 'error');
            } catch (stateErr) {
              logger.error(`[WORKER] Failed to mark photoId ${photoId} error: ${stateErr?.message || stateErr}`);
            }
            return;
          }

          // Trigger BullMQ retry.
          throw new Error(`AI processing failed for photoId ${photoId} (retry_count=${retries})`);
        }

        // AI succeeded: finalize state to finished.
        if (photo.state !== 'finished') {
          try {
            const userId = photo.user_id;
            const fromState = photo.storage_path ? String(photo.storage_path).split('/')[0] : (photo.state || 'inprogress');
            const toState = 'finished';
            const filenameForMove = photo.storage_path
              ? path.posix.basename(String(photo.storage_path))
              : photo.filename;
            const result = await photosState.transitionState(photoId, userId, fromState, toState, filenameForMove, photo.storage_path);
            if (!result?.success) {
              logger.warn(`[WORKER] Storage transition failed for photoId ${photoId}; falling back to DB-only state update`, result?.error);
              await setPhotoStateFallback(photoId, 'finished');
            }
          } catch (stateErr) {
            logger.warn(`[WORKER] State finalize failed for photoId ${photoId}; falling back to DB-only state update`, stateErr?.message || stateErr);
            await setPhotoStateFallback(photoId, 'finished');
          }
        }

        logger.info(`[WORKER] Done photoId: ${photoId}`);
      } catch (err) {
        // On final attempt, mark error so UI doesn't stay stuck in inprogress.
        try {
          const attempts = Number(job?.opts?.attempts) || 1;
          const currentAttempt = Number(job?.attemptsMade) + 1;
          if (currentAttempt >= attempts) {
            logger.warn(`[WORKER] Job exhausted retries for photoId ${photoId}; marking state=error`);
            await setPhotoStateFallback(photoId, 'error');
          }
        } catch (stateErr) {
          logger.error(`[WORKER] Failed to mark error on exhausted retries for photoId ${photoId}: ${stateErr?.message || stateErr}`);
        }
        throw err;
      }
    };

    aiWorker = new BullMQWorker(QUEUE_NAME, processor, {
      connection: redisConnection,
      lockDuration: 300000,
      concurrency: 2,
      attempts: 5,
      backoff: { type: "exponential", delay: 60000 },
    });

    // Observability: low-cardinality worker metrics (no job IDs/names in labels)
    attachBullmqWorkerMetrics({ worker: aiWorker, queueName: QUEUE_NAME, metrics });

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
