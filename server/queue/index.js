// server/queue/index.js
const { Queue, Worker } = require('bullmq');
const path = require('path');
const db = require('../db'); // Assumes Knex db instance
const { updatePhotoAIMetadata } = require('../ai/service');
const { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR, THUMB_DIR } = require('../config/paths');

// Define the Redis connection
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

const QUEUE_NAME = 'ai-processing';

// Create the AI processing queue
const aiQueue = new Queue(QUEUE_NAME, { connection });

// Create the worker
const aiWorker = new Worker(QUEUE_NAME, async (job) => {
  const { photoId } = job.data;
  console.log(`[WORKER] Processing AI job for photoId: ${photoId}`);

  try {
    // Re-fetch the photo data. Assumes Knex refactor is done.
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

    // Call the existing AI service function with correct parameters
    await updatePhotoAIMetadata(db, photo, filePath);

    console.log(`[WORKER] Successfully processed job for photoId: ${photoId}`);
  } catch (error) {
    console.error(`[WORKER] Job for photoId ${photoId} failed:`, error.message);
    // Let BullMQ handle the retry logic
    throw error;
  }
}, {
  connection,
  // Increase lock duration as AI processing can be slow
  lockDuration: 300000, // 5 minutes
  concurrency: 2, // Process 2 jobs at a time
  attempts: 3, // Retry failed jobs 3 times
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

module.exports = { aiQueue };