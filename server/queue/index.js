// server/queue/index.js
const { Queue, Worker: BullMQWorker } = require('bullmq');
const path = require('path');

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
      const { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR } = require('../config/paths');

      aiQueue = new Queue(QUEUE_NAME, { connection });
      redisAvailable = true;
      console.log('[QUEUE] Successfully connected to Redis');

      // Create the worker
      aiWorker = new BullMQWorker(QUEUE_NAME, async (job) => {
        const { photoId } = job.data;
        console.log(`[WORKER] Processing AI job for photoId: ${photoId}`);

        try {
          // Re-fetch the photo data
          const photo = await db('photos').where({ id: photoId }).first();
          if (!photo) {
            throw new Error(`Photo with ID ${photoId} not found.`);
          }

          // Determine the correct file path based on photo state
          const getDir = (state) => {
            switch(state) {
              case 'working': return WORKING_DIR;
              case 'inprogress': return INPROGRESS_DIR;
              case 'finished': return FINISHED_DIR;
              default: return WORKING_DIR;
            }
          };

          const filePath = path.join(getDir(photo.state), photo.filename);

          // Call the existing AI service function
          await updatePhotoAIMetadata(db, photo, filePath);

          console.log(`[WORKER] Successfully processed job for photoId: ${photoId}`);
        } catch (error) {
          console.error(`[WORKER] Job for photoId ${photoId} failed:`, error.message);
          throw error;
        }
      }, {
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
        console.log(`[WORKER] Job ${job.id} (PhotoId: ${job.data.photoId}) completed.`);
      });

      aiWorker.on('failed', (job, err) => {
        console.log(`[WORKER] Job ${job.id} (PhotoId: ${job.data.photoId}) failed: ${err.message}`);
      });

      console.log('[WORKER] AI Worker process started and listening for jobs.');
      
    } catch (error) {
      console.warn('[QUEUE] Redis not available - queue operations will be disabled:', error.message);
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
const addAIJob = async (photoId) => {
  await initializeQueue();
  if (!redisAvailable || !aiQueue) {
    throw new Error('Queue service unavailable - Redis connection required');
  }
  return await aiQueue.add('process-photo-ai', { photoId });
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