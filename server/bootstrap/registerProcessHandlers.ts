// @ts-nocheck

function registerProcessHandlers({ logger }) {
  if (!logger || typeof logger.error !== 'function' || typeof logger.fatal !== 'function') {
    throw new Error('logger with error/fatal is required');
  }

  // Handling crashes in production.
  //
  // Node.js docs say it's unsafe to keep going after an uncaught exception.
  // The system might be in a weird state.
  //
  // So we:
  // 1. Log the error.
  // 2. Exit immediately.
  // 3. Let Docker/K8s restart us fresh.
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('UnhandledRejection at:', promise, 'reason:', reason);
    // Note: We don't exit on unhandled rejection by default.
  });

  process.on('uncaughtException', (err) => {
    // Important: Use fatal level so this is always logged.
    logger.fatal('UncaughtException - Application in undefined state, exiting:', err);
    process.exit(1);
  });
}

module.exports = {
  registerProcessHandlers,
};
