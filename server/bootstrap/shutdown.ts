interface ShutdownLogger {
  info?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: unknown) => void;
}

interface ShutdownTask {
  name: string;
  fn: () => Promise<void> | void;
}

interface ShutdownManager {
  register(name: string, fn: () => Promise<void> | void): void;
  shutdown(signal?: string): Promise<void>;
}

function createShutdownManager({ logger }: { logger: ShutdownLogger }): ShutdownManager {
  const tasks: ShutdownTask[] = [];

  return {
    register(name: string, fn: () => Promise<void> | void) {
      if (!name) throw new Error('shutdown task name is required');
      if (typeof fn !== 'function') throw new Error('shutdown task fn must be a function');
      tasks.push({ name, fn });
    },

    async shutdown(signal?: string) {
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

function installSignalHandlers({ logger, shutdownManager }: { logger: ShutdownLogger; shutdownManager: ShutdownManager }) {
  if (!shutdownManager || typeof shutdownManager.shutdown !== 'function') {
    throw new Error('shutdownManager with shutdown() is required');
  }

  // Best-effort cleanup on graceful shutdown signals.
  if (process.env.NODE_ENV === 'test') return;

  const onSignal = (signal: string) => {
    shutdownManager
      .shutdown(signal)
      .catch((err: unknown) => {
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

export {};
