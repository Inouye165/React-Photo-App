/**
 * Worker process entry point.
 *
 * Starts the AI worker by delegating to `server/queue/index.ts` which
 * lazily initializes the Redis connection and BullMQ worker. Keeps the
 * process alive and attempts a graceful shutdown on SIGINT.
 *
 * This module intentionally performs minimal logic so the queue module can
 * be unit tested independently.
 */
// server/worker.ts

// This file is the entry point for the worker process.
// It imports the worker instance from the queue module,
// which automatically starts it and connects it to Redis.
import './env'; // centralized, idempotent env loader
import { initTracing } from './observability/tracing';
import logger from './logger';
import { isAiEnabled, shouldRequireOpenAiKey } from './utils/aiEnabled';
const tracing = initTracing({ serviceName: 'lumina-worker' });
console.log('[AI Debug] Worker entrypoint reached');
logger.info('Starting AI Worker...');

// Validate critical AI keys before starting worker to prevent API waste
if (shouldRequireOpenAiKey()) {
  const missingAIKeys = [];

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
    missingAIKeys.push('OPENAI_API_KEY');
  }

  if (missingAIKeys.length > 0) {
    console.error('[worker] FATAL: Required AI API keys missing');
    missingAIKeys.forEach(key => console.error(`[worker]  - ${key} is required`));
    console.error('[worker] AI pipeline will fail without these keys');
    console.error('[worker] Worker startup blocked to prevent unnecessary API costs');
    process.exit(1);
  }

  console.log('[worker] ✓ AI API keys present');
} else if (!isAiEnabled()) {
  logger.info('[worker] AI disabled; skipping OpenAI key validation and AI processing');
}

if (process.env.NODE_ENV !== 'production' && !process.env.GOOGLE_MAPS_API_KEY) {
  console.warn('[AI Worker] GOOGLE_MAPS_API_KEY is missing. Places API will be skipped.');
}

// Start the worker
(async () => {
  try {
    const { startWorker } = await import('./queue/index');
    const { aiWorker, redisAvailable } = await startWorker();
    
    if (redisAvailable && aiWorker) {
      logger.info('[WORKER] Worker started successfully');
      
      // Keep the process alive
      process.on('SIGINT', async () => {
        logger.info('[WORKER] Shutting down gracefully...');
        try {
          await tracing.shutdown();
        } catch {
          // best-effort
        }
        if (aiWorker) {
          await aiWorker.close();
        }
        process.exit(0);
      });
    } else {
      logger.warn('[WORKER] Could not start worker - Redis unavailable');
      process.exit(1);
    }
  } catch (error) {
    logger.error('[WORKER] Failed to start worker:', error);
    process.exit(1);
  }
})();