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

console.log('Starting AI Worker...');
require('dotenv').config(); // Load .env variables

// Start the worker
(async () => {
  try {
    const { startWorker } = require('./queue/index');
    const { aiWorker, redisAvailable } = await startWorker();
    
    if (redisAvailable && aiWorker) {
      console.log('[WORKER] Worker started successfully');
      
      // Keep the process alive
      process.on('SIGINT', async () => {
        console.log('[WORKER] Shutting down gracefully...');
        if (aiWorker) {
          await aiWorker.close();
        }
        process.exit(0);
      });
    } else {
      console.log('[WORKER] Could not start worker - Redis unavailable');
      process.exit(1);
    }
  } catch (error) {
    console.error('[WORKER] Failed to start worker:', error);
    process.exit(1);
  }
})();