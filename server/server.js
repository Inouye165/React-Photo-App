// Allow requiring TypeScript modules at runtime (e.g., routes/*.ts).
require('ts-node/register/transpile-only');

// Load env first, before any module reads process.env.
require('./bootstrap/loadEnv').loadEnv();
const bootstrap = require('./bootstrap');

// Validate required env/config deterministically.
try {
  bootstrap.validateConfig();
} catch (err) {
  const message = err && err.message ? err.message : String(err);
  console.error(message);
  process.exit(1);
}

const { logger, db, supabase } = bootstrap.createDependencies();
bootstrap.registerProcessHandlers({ logger });

// Create Express app and register middleware/routes.
const { app, sseManager } = bootstrap.createApp({ logger, db, supabase });

const PORT = process.env.PORT || 3001;

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  const shutdownManager = bootstrap.createShutdownManager({ logger });

  const server = app.listen(PORT, () => {
    console.log(`Photo upload server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  shutdownManager.register('httpServer', async () => {
    await new Promise((resolve) => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
  });

  const { handles } = bootstrap.startIntegrations({ logger, sseManager, supabase });
  for (const h of handles) {
    shutdownManager.register(h.name, h.stop);
  }

  bootstrap.installSignalHandlers({ logger, shutdownManager });
}

// Export after full configuration so tests/importers always get the complete app.
module.exports = app;

