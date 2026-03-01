// @ts-nocheck

const express = require('express');

const metrics = require('../metrics');
const { sampleBullmqQueueCounts } = require('../metrics/bullmq');

function isLoopbackIp(ip) {
  if (!ip) return false;
  const s = String(ip);
  return (
    s === '127.0.0.1' ||
    s === '::1' ||
    s === '::ffff:127.0.0.1'
  );
}

function isLoopbackRequest(req) {
  return isLoopbackIp(req.ip) || isLoopbackIp(req.socket && req.socket.remoteAddress);
}

module.exports = function createMetricsRouter() {
  const router = express.Router();

  // SECURITY: /metrics must not be public.
  // Preferred auth: X-Metrics-Token must match process.env.METRICS_TOKEN
  // Optional dev-only convenience: METRICS_ALLOW_LOCALHOST=true permits loopback requests.
  router.use((req, res, next) => {
    const configuredToken = (process.env.METRICS_TOKEN || '').trim();
    const provided = (req.get('x-metrics-token') || '').trim();

    if (configuredToken && provided && provided === configuredToken) {
      return next();
    }

    const allowLocalhost = (process.env.METRICS_ALLOW_LOCALHOST === 'true');
    if (allowLocalhost && isLoopbackRequest(req)) {
      return next();
    }

    // If no token is configured, deny all non-loopback requests.
    if (!configuredToken) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    if (!provided) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    return res.status(403).json({ success: false, error: 'Forbidden' });
  });

  router.get('/', async (req, res) => {
    // Sample queue depth gauges at scrape time.
    try {
      const queueModule = require('../queue');
      const redisOk = await queueModule.checkRedisAvailable();

      if (redisOk && queueModule.aiQueue) {
        await sampleBullmqQueueCounts({
          queue: queueModule.aiQueue,
          queueName: 'ai-processing',
          metrics,
        });
      } else {
        // Avoid stale gauges if Redis is down/unavailable.
        metrics.setBullmqQueueJobs('ai-processing', {
          active: 0,
          waiting: 0,
          delayed: 0,
          failed: 0,
          completed: 0,
        });
      }
    } catch {
      metrics.incScrapeError('redis');
    }

    try {
      const body = await metrics.registry.metrics();
      res.set('Content-Type', metrics.registry.contentType);
      return res.status(200).send(body);
    } catch {
      metrics.incScrapeError('registry');
      return res.status(500).json({ success: false, error: 'Failed to render metrics' });
    }
  });

  return router;
};
