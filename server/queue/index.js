// server/queue/index.js
const { Queue, Worker: BullMQWorker } = require('bullmq');
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
      // Lazy load dependencies
      const db = require('../db');
      const { updatePhotoAIMetadata } = require('../ai/service');

  aiQueue = new Queue(QUEUE_NAME, { connection });
  redisAvailable = true;
  logger.info('[QUEUE] Successfully connected to Redis');

      // Create the worker
      /**
       * Processor for AI jobs pulled from the queue.
       *
       * @param {import('bullmq').Job} job - The job object containing data for processing.
       * @returns {Promise<void>} Resolves when processing completes successfully.
       * @throws Will throw when the photo row cannot be found or AI processing fails,
       * causing the job to be retried according to worker options.
       */
      const processor = async (job) => {
        const { photoId, isHighAccuracy = false } = job.data;
  logger.info(`[WORKER] Processing AI job for photoId: ${photoId}`);

        try {
          // Re-fetch the photo data
          const photo = await db('photos').where({ id: photoId }).first();
          if (!photo) {
            throw new Error(`Photo with ID ${photoId} not found.`);
          }

          // Use storage path for AI processing
          const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;

          // Call the existing AI service function
          await updatePhotoAIMetadata(db, photo, storagePath, { isHighAccuracy });

          logger.info(`[WORKER] Successfully processed job for photoId: ${photoId}`);
        } catch (error) {
          logger.error(`[WORKER] Job for photoId ${photoId} failed:`, error.message);
          throw error;
        }
      };

      aiWorker = new BullMQWorker(QUEUE_NAME, processor, {
        connection,
        lockDuration: 300000, // 5 minutes
        concurrency: 2,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1 minute delay for first retry
        },
      });

      aiWorker.on('completed', (job) => {
        logger.info(`[WORKER] Job ${job.id} (PhotoId: ${job.data.photoId}) completed.`);
      });

      aiWorker.on('failed', (job, err) => {
        logger.warn(`[WORKER] Job ${job.id} (PhotoId: ${job.data.photoId}) failed: ${err.message}`);
      });

      logger.info('[WORKER] AI Worker process started and listening for jobs.');
      
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
const addAIJob = async (photoId, jobData = {}) => {
  await initializeQueue();
  if (!redisAvailable || !aiQueue) {
    throw new Error('Queue service unavailable - Redis connection required');
  }
  const payload = { ...jobData, photoId };
  return await aiQueue.add('process-photo-ai', payload);
};

// For direct worker usage (worker.js)
const startWorker = async () => {
  await initializeQueue();
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