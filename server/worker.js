/**
 * Worker process entry point.
 *
 * Starts the AI worker by delegating to `server/queue/index.js` which
 * lazily initializes the Redis connection and BullMQ worker. Keeps the
 * process alive and attempts a graceful shutdown on SIGINT.
 *
 * This module intentionally performs minimal logic so the queue module can
 * be unit tested independently.
 */
// server/worker.js

// This file is the entry point for the worker process.
// It imports the worker instance from the queue module,
// which automatically starts it and connects it to Redis.


const logger = require('./logger');
console.log('[AI Debug] Worker entrypoint reached');
logger.info('Starting AI Worker...');
require('./env'); // centralized, idempotent env loader

// Start the worker
(async () => {
  try {
    const { startWorker } = require('./queue/index');
    const { aiWorker, redisAvailable } = await startWorker();
    
    if (redisAvailable && aiWorker) {
      logger.info('[WORKER] Worker started successfully');
      
      // Keep the process alive
      process.on('SIGINT', async () => {
        logger.info('[WORKER] Shutting down gracefully...');
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