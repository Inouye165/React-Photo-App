// server/queue/index.js
const { Queue } = require('bullmq');
const logger = require('../logger');

// Define the Redis connection
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

const QUEUE_NAME = 'ai-processing';

// Lazy initialization variables
let aiQueue = null;
let aiWorker = null;
let redisAvailable = null; // null = not checked yet, true/false = checked
let initializationPromise = null;

// Lazy initialization function
async function initializeQueue() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // Lazy load dependencies required for queue operations (worker needs
      // these dependencies when it is created in startWorker()). We avoid
      // requiring them here to prevent creating unused variables.

    aiQueue = new Queue(QUEUE_NAME, { connection });
  redisAvailable = true;
  logger.info('[QUEUE] Successfully connected to Redis');
      // NOTE: Do not create the worker here. The worker process should be
      // started explicitly via `startWorker()` (see worker.js). Creating a
      // worker during queue initialization results in the server starting a
      // worker inline when `addAIJob` is called, which can lead to duplicate
      // workers and log output appearing in the server process. This is
      // intentionally deferred to allow a separate worker process to be
      // started by `npm run worker`.
      // Processor is only used by the worker. Worker instances are created in
      // `startWorker()` so we leave processor implementation there and avoid
      // creating or using it in the queue initializer.

      // leave aiWorker creation to startWorker

      // Worker event handlers are attached when the worker is created in
      // startWorker(). Do not attach them here where aiWorker may still be null.

      // Worker will log start info when startWorker() is invoked.
      
    } catch (error) {
      logger.warn('[QUEUE] Redis not available - queue operations will be disabled:', error.message);
      redisAvailable = false;
      aiQueue = null;
      aiWorker = null;
    }
  })();

  return initializationPromise;
}

// Function to check if Redis is available (lazy check)
async function checkRedisAvailable() {
  if (redisAvailable === null) {
    await initializeQueue();
  }
  return redisAvailable;
}

// Export functions to handle queue operations
const addAIJob = async (photoId, options = {}) => {
  await initializeQueue();
  if (!redisAvailable || !aiQueue) {
    throw new Error('Queue service unavailable - Redis connection required');
  }
  const jobData = { photoId };
  if (options && options.modelOverrides) jobData.modelOverrides = options.modelOverrides;
  if (options && options.models) jobData.modelOverrides = options.models;
  return await aiQueue.add('process-photo-ai', jobData);
};

// For direct worker usage (worker.js)
const startWorker = async () => {
  await initializeQueue();

  // Only create the worker if it doesn't exist yet. This function is the
  // canonical place to create the worker and allows the worker process to be
  // started separately from the server process.
  if (!aiWorker) {
    const { Worker: BullMQWorker } = require('bullmq');
    const db = require('../db');
    const { updatePhotoAIMetadata } = require('../ai/service');

    const processor = async (job) => {
      const { photoId, modelOverrides } = job.data || {};
      logger.info(`[WORKER] Processing AI job for photoId: ${photoId}`);
      try {
        const photo = await db('photos').where({ id: photoId }).first();
        if (!photo) throw new Error(`Photo with ID ${photoId} not found.`);
        const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;
        await updatePhotoAIMetadata(db, photo, storagePath, modelOverrides);
        logger.info(`[WORKER] Successfully processed job for photoId: ${photoId}`);
      } catch (error) {
        logger.error(`[WORKER] Job for photoId ${photoId} failed:`, error.message);
        throw error;
      }
    };

    aiWorker = new BullMQWorker(QUEUE_NAME, processor, {
      connection,
      lockDuration: 300000,
      concurrency: 2,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    });

    aiWorker.on('completed', (job) => logger.info(`[WORKER] Job ${job.id} (PhotoId: ${job.data.photoId}) completed.`));
    aiWorker.on('failed', (job, err) => logger.warn(`[WORKER] Job ${job.id} (PhotoId: ${job.data.photoId}) failed: ${err.message}`));
    logger.info('[WORKER] AI Worker process started and listening for jobs.');
  }

  return { aiWorker, redisAvailable };
};

// Synchronous getter for redisAvailable (for routes)
const getRedisStatus = () => redisAvailable;

module.exports = { 
  aiQueue, 
  aiWorker,
  redisAvailable: getRedisStatus,
  addAIJob,
  startWorker,
  checkRedisAvailable
};