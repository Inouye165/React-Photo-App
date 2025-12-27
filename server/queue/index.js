const { Queue, Worker: BullMQWorker } = require("bullmq");
const path = require('path');
const logger = require("../logger");
const { createRedisConnection } = require("../redis/connection");
const metrics = require('../metrics');
const { attachBullmqWorkerMetrics } = require('../metrics/bullmq');
const { randomUUID } = require('crypto');

const QUEUE_NAME = "ai-processing";
const PHOTO_STATUS_CHANNEL = 'photo:status:v1';

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
      // Lazy init so missing REDIS_URL doesn't crash tests/CI.
      redisConnection = createRedisConnection();

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

      // Cleanup if we partially created a client.
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

function shouldPublishTerminalFailure(job) {
  const rawAttempts = Number(job?.opts?.attempts);
  const attempts = Number.isFinite(rawAttempts) && rawAttempts > 0 ? rawAttempts : 1;

  const rawAttemptsMade = Number(job?.attemptsMade);
  const attemptsMade = Number.isFinite(rawAttemptsMade) && rawAttemptsMade >= 0 ? rawAttemptsMade : 0;

  // BullMQ emits 'failed' for each failed attempt. When the 'failed' event fires,
  // attemptsMade is treated as the number of attempts completed *before* this failure.
  // Therefore this failure is attempt #(attemptsMade + 1). Terminal means it was the
  // last allowed attempt.
  return (attemptsMade + 1) >= attempts;
}

async function publishPhotoStatus({ redis, db, status, photoId, jobId }) {
  if (!redis || typeof redis.publish !== 'function') return { ok: false, reason: 'no_redis' };
  if (!db || typeof db !== 'function') return { ok: false, reason: 'no_db' };
  if (!photoId) return { ok: false, reason: 'no_photoId' };

  try {
    const row = await db('photos').where({ id: photoId }).select('user_id').first();
    const userId = row?.user_id != null ? String(row.user_id) : null;
    if (!userId) {
      logger.warn('[WORKER] Photo status publish skipped: user_id missing', { photoId: String(photoId), status, jobId: jobId ? String(jobId) : undefined });
      return { ok: false, reason: 'missing_userId' };
    }

    const payload = {
      userId,
      eventId: (typeof randomUUID === 'function') ? randomUUID() : `${Date.now()}`,
      photoId: String(photoId),
      status,
      updatedAt: new Date().toISOString(),
    };

    await redis.publish(PHOTO_STATUS_CHANNEL, JSON.stringify(payload));
    logger.info('[WORKER] Published photo status event', {
      userId,
      photoId: payload.photoId,
      status,
      eventId: payload.eventId,
      jobId: jobId ? String(jobId) : undefined,
    });

    return { ok: true, payload };
  } catch (err) {
    // Non-fatal: log and continue.
    try {
      metrics.incRealtimeRedisPublishFail?.();
    } catch {
      // ignore
    }
    logger.warn('[WORKER] Failed to publish photo status event', {
      photoId: String(photoId),
      status,
      jobId: jobId ? String(jobId) : undefined,
      error: err?.message || String(err),
    });
    return { ok: false, reason: 'publish_failed' };
  }
}

function attachPhotoStatusPublisher({ worker, redis, db }) {
  if (!worker || typeof worker.on !== 'function') {
    throw new Error('worker must be an EventEmitter-like object');
  }

  worker.on('completed', async (job) => {
    const photoId = job?.data?.photoId;
    await publishPhotoStatus({ redis, db, status: 'finished', photoId, jobId: job?.id });
  });

  worker.on('failed', async (job) => {
    const photoId = job?.data?.photoId;
    if (!shouldPublishTerminalFailure(job)) return;

    // Best-effort de-dupe: ensure we only publish terminal failed once per job object.
    if (job && job.__photoStatusTerminalFailedPublished) return;
    if (job) job.__photoStatusTerminalFailedPublished = true;

    await publishPhotoStatus({ redis, db, status: 'failed', photoId, jobId: job?.id });
  });
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
    const { ensureHeicDisplayAsset } = require('../media/heicDisplayAsset');
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

        // Generate HEIC/HEIF display JPEG once per upload.
        // Idempotent: if display_path already exists, no work is done.
        // Non-fatal: failures leave display_path NULL so request-time fallback can still work.
        try {
          const freshPhoto = await db('photos')
            .where({ id: photoId })
            .select('id', 'user_id', 'filename', 'state', 'storage_path', 'display_path')
            .first();

          if (freshPhoto) {
            await ensureHeicDisplayAsset({
              db,
              storageClient: supabase.storage.from('photos'),
              photo: freshPhoto,
            });
          }
        } catch (assetErr) {
          logger.warn('[WORKER] HEIC display asset generation failed (non-fatal)', {
            photoId: String(photoId),
            error: assetErr?.message || String(assetErr),
          });
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

    // Publish status transitions to Redis for multi-instance SSE fanout.
    // Publish failures should never crash the worker.
    try {
      attachPhotoStatusPublisher({ worker: aiWorker, redis: redisConnection, db });
    } catch (err) {
      logger.warn('[WORKER] Failed to attach photo status publisher', { error: err?.message || String(err) });
    }

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

module.exports.__private__ = {
  attachPhotoStatusPublisher,
  publishPhotoStatus,
  shouldPublishTerminalFailure,
  PHOTO_STATUS_CHANNEL,
};

// Export live views (prevents “stale null” exports after lazy init)
Object.defineProperties(module.exports, {
  aiQueue: { enumerable: true, get: () => aiQueue },
  aiWorker: { enumerable: true, get: () => aiWorker },
  redisAvailable: { enumerable: true, get: () => redisAvailable },
});
