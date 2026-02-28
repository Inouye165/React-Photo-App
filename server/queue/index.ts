// @ts-nocheck

const { Queue, Worker: BullMQWorker } = require("bullmq");
const path = require('path');
const fs = require('fs');
const logger = require("../logger");
const { createRedisConnection } = require("../redis/connection");
const metrics = require('../metrics');
const { attachBullmqWorkerMetrics } = require('../metrics/bullmq');
const { randomUUID } = require('crypto');
const { sanitizeRequestId } = require('../lib/requestId');
const { context, propagation, trace } = require('@opentelemetry/api');
const { isAiEnabled } = require('../utils/aiEnabled');

const QUEUE_NAME = "ai-processing";
const PHOTO_STATUS_CHANNEL = 'photo:status:v1';

// Internal state (lazy init)
let redisConnection = null;
let aiQueue = null;
let aiWorker = null;
let redisAvailable = false;
let initializationPromise = null;
const tracer = trace.getTracer('bullmq');

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

function isTracingEnabled() {
  const flag = (process.env.OTEL_ENABLED || '').toLowerCase();
  return flag === 'true' || flag === '1';
}

function injectTraceContext(jobData) {
  if (!isTracingEnabled()) return;
  const activeSpan = trace.getSpan(context.active());
  if (!activeSpan || typeof activeSpan.spanContext !== 'function') return;

  const spanContext = activeSpan.spanContext();
  if (!trace.isSpanContextValid(spanContext)) return;

  const carrier = {};
  propagation.inject(context.active(), carrier);
  if (carrier.traceparent) {
    jobData.traceContext = {
      traceparent: carrier.traceparent,
      tracestate: carrier.tracestate,
    };
  }
}

function extractParentContext(traceContext) {
  if (!isTracingEnabled()) return context.active();
  if (!traceContext || (!traceContext.traceparent && !traceContext.tracestate)) {
    return context.active();
  }
  return propagation.extract(context.active(), traceContext);
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
    logger.warn('[QUEUE] Cannot add AI job - Redis unavailable', { photoId });
    throw new Error("Queue service unavailable - Redis connection required");
  }

  const jobData = { photoId };

  const requestId = sanitizeRequestId(options.requestId);
  if (requestId) jobData.requestId = requestId;

  // Back-compat: some callers used `models` instead of `modelOverrides`.
  const overrides = options.modelOverrides ?? options.models;
  if (overrides) jobData.modelOverrides = overrides;

  if (options.processMetadata !== undefined) jobData.processMetadata = options.processMetadata;
  if (options.generateThumbnail !== undefined) jobData.generateThumbnail = options.generateThumbnail;
  if (options.generateDisplay !== undefined) jobData.generateDisplay = options.generateDisplay;
  if (options.runAiAnalysis !== undefined) jobData.runAiAnalysis = options.runAiAnalysis;
  if (options.collectibleOverride !== undefined) jobData.collectibleOverride = options.collectibleOverride;

  const jobOpts = {
    // Preserve existing retry intent (was previously set on the Worker, which
    // BullMQ does not use for job retries).
    attempts: 5,
    backoff: { type: "exponential", delay: 60000 },
  };

  const jobName = 'process-photo-ai';

  return tracer.startActiveSpan(
    'bullmq.enqueue',
    {
      attributes: {
        'queue.name': QUEUE_NAME,
        'job.name': jobName,
      },
    },
    async (span) => {
      try {
        injectTraceContext(jobData);

        logger.info('[QUEUE] Adding AI job', {
          photoId,
          requestId: requestId || undefined,
          options: Object.keys(options).filter((k) => k !== 'requestId'),
        });
        const job = await aiQueue.add(jobName, jobData, jobOpts);
        logger.info('[QUEUE] AI job added successfully', { photoId, jobId: job.id, requestId: requestId || undefined });
        return job;
      } finally {
        if (span && typeof span.end === 'function') span.end();
      }
    }
  );
};

const addAppAssessmentJob = async (assessmentId) => {
  await initializeQueue();

  if (!redisAvailable || !aiQueue) {
    throw new Error("Queue service unavailable - Redis connection required");
  }

  if (!assessmentId) {
    throw new Error('assessmentId is required');
  }

  return aiQueue.add('run-app-assessment', { assessmentId });
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

    function safeReadFile(absPath) {
      try {
        return fs.readFileSync(absPath, 'utf8');
      } catch (err) {
        return `/* READ_FAILED: ${absPath} :: ${err?.message || String(err)} */`;
      }
    }

    function buildBalancedRubricPrompt({ commitHash, files }) {
      const header = [
        'You are an expert senior engineer performing an internal codebase assessment.',
        'HALLUCINATION GUARD: Only use evidence found in the provided files. If you cannot find evidence, say so explicitly.',
        'Return STRICT JSON ONLY (no markdown, no prose outside JSON).',
        '',
        `Commit hash: ${commitHash || 'unknown'}`,
        '',
        'Balanced Rubric (0-100 per category):',
        '- security (35%)',
        '- correctness (25%)',
        '- reliability (15%)',
        '- maintainability (15%)',
        '- performance (10%)',
        '',
        'Output JSON schema:',
        '{',
        '  "scores": {"security": number, "correctness": number, "reliability": number, "maintainability": number, "performance": number},',
        '  "final_grade": number,',
        '  "overall_summary": string,',
        '  "findings": [',
        '    {"area": string, "title": string, "evidence": string, "impact": string, "recommendation": string}',
        '  ]',
        '}',
        '',
        'Provided files:',
      ].join('\n');

      const body = Object.entries(files)
        .map(([name, content]) => {
          return [`\n===== FILE: ${name} =====\n`, content, '\n'].join('');
        })
        .join('\n');

      return `${header}\n${body}`;
    }

    async function processPhotoAIJob(job) {
      const { photoId, modelOverrides, processMetadata, generateThumbnail, runAiAnalysis, collectibleOverride } = job.data || {};
      logger.info(`[WORKER] Processing job for photoId: ${photoId}`);

      const aiEnabled = isAiEnabled();
      // Back-compat: jobs that predate `runAiAnalysis` should behave like legacy AI jobs.
      const shouldRunAiAnalysis = runAiAnalysis !== false && aiEnabled;

      const photo = await db("photos").where({ id: photoId }).first();
      if (!photo) throw new Error(`Photo with ID ${photoId} not found.`);

      const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;

      try {
        // Always run derivative generation for browser compatibility.
        await processUploadedPhoto(db, photoId, {
          processMetadata: processMetadata !== false,
          generateThumbnail: generateThumbnail !== false,
          generateDisplay: true,
        });

        if (shouldRunAiAnalysis) {
          const aiResult = await updatePhotoAIMetadata(db, photo, storagePath, modelOverrides, { collectibleOverride });

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
              const storagePathStr = photo.storage_path ? String(photo.storage_path) : '';
              const isPinnedOriginal = storagePathStr.startsWith('original/');

              if (isPinnedOriginal) {
                // New architecture: originals live under original/<photoId>/... and should not be moved
                // by the legacy state-based storage transitions.
                await setPhotoStateFallback(photoId, 'finished');
              } else {
                const fromState = photo.storage_path ? storagePathStr.split('/')[0] : (photo.state || 'inprogress');
                const toState = 'finished';
                const filenameForMove = photo.storage_path
                  ? path.posix.basename(storagePathStr)
                  : photo.filename;
                const result = await photosState.transitionState(photoId, userId, fromState, toState, filenameForMove, photo.storage_path);
                if (!result?.success) {
                  logger.warn(`[WORKER] Storage transition failed for photoId ${photoId}; falling back to DB-only state update`, result?.error);
                  await setPhotoStateFallback(photoId, 'finished');
                }
              }
            } catch (stateErr) {
              logger.warn(`[WORKER] State finalize failed for photoId ${photoId}; falling back to DB-only state update`, stateErr?.message || stateErr);
              await setPhotoStateFallback(photoId, 'finished');
            }
          }
        } else {
          const reason = aiEnabled ? 'derivatives-only job' : 'AI disabled';
          logger.info(`[WORKER] Skipping AI analysis (${reason})`, {
            photoId: String(photoId),
            requestId: sanitizeRequestId(job?.data?.requestId) || undefined,
          });
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
    }

    async function processAppAssessmentJob(job) {
      const { assessmentId } = job.data || {};
      if (!assessmentId) throw new Error('assessmentId missing');

      const createAssessmentsDb = require('../services/assessmentsDb');
      const assessmentsDb = createAssessmentsDb({ db });
      const { openai } = require('../ai/openaiClient');

      const assessment = await assessmentsDb.getAssessmentById(assessmentId);
      if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);

      const files = {
        'server/middleware/security.ts': safeReadFile(path.resolve(__dirname, '..', 'middleware', 'security.ts')),
        'server/routes/photos.ts': safeReadFile(path.resolve(__dirname, '..', 'routes', 'photos.ts')),
        'server/services/photosDb.js': safeReadFile(path.resolve(__dirname, '..', 'services', 'photosDb.js')),
      };

      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const prompt = buildBalancedRubricPrompt({ commitHash: assessment.commit_hash, files });

      const traceLog = {
        prompt,
        commit_hash: assessment.commit_hash || null,
        captured_at: new Date().toISOString(),
        files,
        model,
      };

      try {
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: 'You are a precise code auditor.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
        });

        const responseText = response?.choices?.[0]?.message?.content || '';
        let parsed = null;
        try {
          parsed = responseText ? JSON.parse(responseText) : null;
        } catch {
          parsed = null;
        }

        await assessmentsDb.setAssessmentResult({
          id: assessmentId,
          raw_ai_response: {
            model: response?.model || model,
            responseText,
            parsed,
            usage: response?.usage || null,
          },
          trace_log: traceLog,
          status: 'pending_review',
        });

        return { ok: true };
      } catch (err) {
        const errorPayload = {
          error: err?.message || String(err),
        };

        try {
          await assessmentsDb.setAssessmentResult({
            id: assessmentId,
            raw_ai_response: errorPayload,
            trace_log: traceLog,
            status: 'pending_review',
          });
        } catch (persistErr) {
          logger.warn('[WORKER] Failed to persist assessment error payload', {
            assessmentId: String(assessmentId),
            error: persistErr?.message || String(persistErr),
          });
        }

        throw err;
      }
    }

    const processor = async (job) => {
      const name = job?.name || 'unknown';

      if (!isTracingEnabled()) {
        if (name === 'run-app-assessment') {
          logger.info(`[WORKER] Processing app assessment job ${job?.id} (assessmentId: ${job?.data?.assessmentId})`);
          return processAppAssessmentJob(job);
        }

        // Default/legacy
        return processPhotoAIJob(job);
      }

      const parentContext = extractParentContext(job?.data?.traceContext);
      const attemptsMade = Number(job?.attemptsMade);
      const attempt = Number.isFinite(attemptsMade) ? attemptsMade + 1 : undefined;

      const attributes = {
        'queue.name': QUEUE_NAME,
        'job.name': name,
      };

      if (job?.id != null) attributes['job.id'] = String(job.id);
      if (attempt != null) attributes['job.attempt'] = attempt;

      return tracer.startActiveSpan(
        'bullmq.process',
        { attributes },
        parentContext,
        async (span) => {
          try {
            if (name === 'run-app-assessment') {
              logger.info(`[WORKER] Processing app assessment job ${job?.id} (assessmentId: ${job?.data?.assessmentId})`);
              return processAppAssessmentJob(job);
            }

            // Default/legacy
            return processPhotoAIJob(job);
          } catch (err) {
            if (span?.recordException) span.recordException(err);
            if (span?.setStatus) span.setStatus({ code: 2, message: err?.message || String(err) });
            throw err;
          } finally {
            if (span && typeof span.end === 'function') span.end();
          }
        }
      );
    };

    aiWorker = new BullMQWorker(QUEUE_NAME, processor, {
      connection: redisConnection,
      lockDuration: 60000,
      stalledInterval: 30000,
      concurrency: 2,
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

    aiWorker.on("completed", (job) => {
      logger.info('[WORKER] Job completed', {
        jobId: job?.id,
        name: job?.name,
        photoId: job?.data?.photoId,
        requestId: sanitizeRequestId(job?.data?.requestId) || undefined,
      });
    });
    aiWorker.on("failed", (job, err) => {
      logger.warn('[WORKER] Job failed', {
        jobId: job?.id,
        name: job?.name,
        photoId: job?.data?.photoId,
        requestId: sanitizeRequestId(job?.data?.requestId) || undefined,
        error: err?.message || String(err),
      });
    });

    logger.info("[WORKER] Started and listening for jobs");
  }

  return { aiWorker, redisAvailable };
};

module.exports = {
  addAIJob,
  addAppAssessmentJob,
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

export { addAIJob, addAppAssessmentJob, startWorker, checkRedisAvailable };
export {};
