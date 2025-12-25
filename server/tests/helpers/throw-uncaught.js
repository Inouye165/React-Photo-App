#!/usr/bin/env node
/**
 * Test helper: Simulates an uncaught exception to verify process lifecycle handling
 * This script is used by process-lifecycle.test.js to verify that the server
 * properly exits with code 1 when an uncaught exception occurs.
 * 
 * Usage: node throw-uncaught.js
 * Expected: Process exits with code 1 after logging the error
 */

'use strict';

// Load server environment configuration first
require('../../env');

// Import logger to use the same logging infrastructure as the server
const logger = require('../../logger');

// Set up the uncaught exception handler exactly as server.js does
process.on('uncaughtException', (err) => {
  // Log the fatal error using the logger
  logger.fatal('UncaughtException:', err);
  
  // In production environments with Kubernetes or Docker, a non-zero exit
  // code signals the orchestrator to restart the pod/container. This is
  // critical for recovering from undefined application states.
  process.exit(1);
});

// Also handle unhandled rejections (consistency with server.js)
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UnhandledRejection at:', promise, 'reason:', reason);
  // Note: We don't exit on unhandled rejection as per current server behavior
  // Only uncaughtException triggers process exit
});

// Simulate an uncaught exception after a brief delay so handlers are registered
setImmediate(() => {
  throw new Error('Simulated uncaught exception for testing');
});
