function createShutdownManager({ logger }) {
  const tasks = [];

  return {
    register(name, fn) {
      if (!name) throw new Error('shutdown task name is required');
      if (typeof fn !== 'function') throw new Error('shutdown task fn must be a function');
      tasks.push({ name, fn });
    },

    async shutdown(signal) {
      const sig = signal || 'shutdown';
      if (logger && typeof logger.info === 'function') {
        logger.info('[server] Graceful shutdown start', { signal: sig, tasks: tasks.length });
      }

      for (const task of tasks) {
        try {
          await task.fn();
        } catch (err) {
          if (logger && typeof logger.error === 'function') {
            logger.error('[server] Shutdown task failed', { name: task.name, error: err });
          }
        }
      }

      if (logger && typeof logger.info === 'function') {
        logger.info('[server] Graceful shutdown complete', { signal: sig });
      }
    },
  };
}

function installSignalHandlers({ logger, shutdownManager }) {
  if (!shutdownManager || typeof shutdownManager.shutdown !== 'function') {
    throw new Error('shutdownManager with shutdown() is required');
  }

  // Best-effort cleanup on graceful shutdown signals.
  if (process.env.NODE_ENV === 'test') return;

  const onSignal = (signal) => {
    shutdownManager
      .shutdown(signal)
      .catch((err) => {
        if (logger && typeof logger.error === 'function') {
          logger.error('[server] Graceful shutdown failed', err);
        }
      })
      .finally(() => process.exit(0));
  };

  process.once('SIGTERM', () => onSignal('SIGTERM'));
  process.once('SIGINT', () => onSignal('SIGINT'));
}

module.exports = {
  createShutdownManager,
  installSignalHandlers,
};
