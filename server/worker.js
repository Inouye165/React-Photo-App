// server/worker.js

// This file is the entry point for the worker process.
// It imports the worker instance from the queue module,
// which automatically starts it and connects it to Redis.

console.log('Starting AI Worker...');
require('dotenv').config(); // Load .env variables
require('./queue/index'); // This line imports and starts the worker