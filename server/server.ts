// Load env first, before any module reads process.env.
require('./bootstrap/loadEnv').loadEnv();
const { initTracing } = require('./observability/tracing');
const tracing = initTracing({ serviceName: 'lumina-web' }) as { shutdown: () => Promise<void> };
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
const { app, socketManager } = bootstrap.createApp({ logger, db, supabase });

const PORT = process.env.PORT || 3001;

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  const shutdownManager = bootstrap.createShutdownManager({ logger });

  shutdownManager.register('otel', () => tracing.shutdown());

  const http = require('http');
  const server = http.createServer(app);

  server.on('upgrade', (req: any, socket: any, head: any) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      if (
        pathname === '/events/photos' ||
        pathname === '/api/v1/events/photos' ||
        pathname === '/events/whiteboard' ||
        pathname === '/api/v1/events/whiteboard'
      ) {
        socketManager.handleUpgrade(req, socket, head);
        return;
      }
    } catch {
      // ignore
    }

    try {
      socket.destroy();
    } catch {
      // ignore
    }
  });

  server.listen(PORT, () => {
    console.log(`Photo upload server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  shutdownManager.register('httpServer', async () => {
    await new Promise<void>((resolve) => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
  });

  shutdownManager.register('websockets', async () => {
    try {
      socketManager.closeAll?.('server_shutdown');
    } catch {
      // ignore
    }
  });

  const { handles } = bootstrap.startIntegrations({ logger, socketManager, supabase });
  for (const h of handles) {
    shutdownManager.register(h.name, h.stop);
  }

  bootstrap.installSignalHandlers({ logger, shutdownManager });
}

// Export after full configuration so tests/importers always get the complete app.
module.exports = app;

export {};
