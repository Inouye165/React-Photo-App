const promClient = require('prom-client');

function createMetrics() {
  const registry = new promClient.Registry();

  const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  const httpRequestDurationMs = new promClient.Histogram({
    name: 'http_request_duration_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['method', 'route'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [registry],
  });

  const httpErrorsTotal = new promClient.Counter({
    name: 'http_errors_total',
    help: 'Total HTTP 5xx responses',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  const bullmqQueueJobs = new promClient.Gauge({
    name: 'bullmq_queue_jobs',
    help: 'BullMQ queue job counts sampled at scrape time',
    labelNames: ['queue', 'state'],
    registers: [registry],
  });

  const bullmqJobDurationMs = new promClient.Histogram({
    name: 'bullmq_job_duration_ms',
    help: 'BullMQ job duration in milliseconds',
    labelNames: ['queue'],
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000],
    registers: [registry],
  });

  const bullmqJobFailuresTotal = new promClient.Counter({
    name: 'bullmq_job_failures_total',
    help: 'Total BullMQ job failures',
    labelNames: ['queue'],
    registers: [registry],
  });

  const dbQueryDurationMs = new promClient.Histogram({
    name: 'db_query_duration_ms',
    help: 'Database query duration in milliseconds',
    labelNames: ['operation', 'table'],
    buckets: [1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500],
    registers: [registry],
  });

  const dbQueriesTotal = new promClient.Counter({
    name: 'db_queries_total',
    help: 'Total database queries',
    labelNames: ['operation', 'table', 'result'],
    registers: [registry],
  });

  const metricsScrapeErrorsTotal = new promClient.Counter({
    name: 'metrics_scrape_errors_total',
    help: 'Total scrape-time errors while collecting metrics',
    labelNames: ['component'],
    registers: [registry],
  });

  // --- Realtime photo processing events (SSE) ---
  const realtimeActiveConnections = new promClient.Gauge({
    name: 'realtime_active_connections',
    help: 'Active realtime SSE connections',
    registers: [registry],
  });

  const realtimeConnectsTotal = new promClient.Counter({
    name: 'realtime_connects_total',
    help: 'Total realtime SSE stream connects',
    registers: [registry],
  });

  const realtimeDisconnectsTotal = new promClient.Counter({
    name: 'realtime_disconnects_total',
    help: 'Total realtime SSE stream disconnects',
    registers: [registry],
  });

  const realtimeDisconnectReasonTotal = new promClient.Counter({
    name: 'realtime_disconnect_reason_total',
    help: 'Realtime SSE disconnects by reason',
    labelNames: ['reason'],
    registers: [registry],
  });

  const realtimeEventsPublishedTotal = new promClient.Counter({
    name: 'realtime_events_published_total',
    help: 'Total realtime photo.processing events published into SSE fanout',
    registers: [registry],
  });

  const realtimeRedisPublishFailTotal = new promClient.Counter({
    name: 'realtime_redis_publish_fail_total',
    help: 'Total failures publishing realtime events to Redis',
    registers: [registry],
  });

  const realtimeRedisSubscribeErrorTotal = new promClient.Counter({
    name: 'realtime_redis_subscribe_error_total',
    help: 'Total Redis subscribe/connection errors for realtime subscriber',
    registers: [registry],
  });

  function toLabelValue(value, fallback) {
    const s = value == null ? '' : String(value);
    const trimmed = s.trim();
    return trimmed === '' ? fallback : trimmed;
  }

  function observeHttpRequest({ method, route, status, durationMs }) {
    const m = toLabelValue(method, 'UNKNOWN').toUpperCase();
    const r = toLabelValue(route, 'unknown');
    const st = toLabelValue(status, '0');

    httpRequestsTotal.labels(m, r, st).inc();
    httpRequestDurationMs.labels(m, r).observe(Number(durationMs) || 0);

    const statusNum = Number(st);
    if (Number.isFinite(statusNum) && statusNum >= 500) {
      httpErrorsTotal.labels(m, r, st).inc();
    }
  }

  function setBullmqQueueJobs(queueName, countsByState) {
    const queue = toLabelValue(queueName, 'unknown');
    const knownStates = ['active', 'waiting', 'delayed', 'failed', 'completed'];

    for (const state of knownStates) {
      const v = countsByState && Object.prototype.hasOwnProperty.call(countsByState, state)
        ? Number(countsByState[state])
        : 0;
      bullmqQueueJobs.labels(queue, state).set(Number.isFinite(v) ? v : 0);
    }
  }

  function observeBullmqJobDuration(queueName, durationMs) {
    const queue = toLabelValue(queueName, 'unknown');
    const d = Number(durationMs);
    if (!Number.isFinite(d) || d < 0) return;
    bullmqJobDurationMs.labels(queue).observe(d);
  }

  function incBullmqJobFailure(queueName) {
    const queue = toLabelValue(queueName, 'unknown');
    bullmqJobFailuresTotal.labels(queue).inc();
  }

  function observeDbQuery({ operation, table, durationMs, result }) {
    const op = toLabelValue(operation, 'unknown');
    const tbl = toLabelValue(table, 'unknown');
    const res = toLabelValue(result, 'unknown');

    const d = Number(durationMs);
    if (Number.isFinite(d) && d >= 0) {
      dbQueryDurationMs.labels(op, tbl).observe(d);
    }

    dbQueriesTotal.labels(op, tbl, res).inc();
  }

  function incScrapeError(component) {
    metricsScrapeErrorsTotal.labels(toLabelValue(component, 'unknown')).inc();
  }

  function setRealtimeActiveConnections(value) {
    const n = Number(value);
    realtimeActiveConnections.set(Number.isFinite(n) && n >= 0 ? n : 0);
  }

  function incRealtimeConnect() {
    realtimeConnectsTotal.inc();
  }

  function incRealtimeDisconnect() {
    realtimeDisconnectsTotal.inc();
  }

  function incRealtimeDisconnectReason(reason) {
    realtimeDisconnectReasonTotal.labels(toLabelValue(reason, 'unknown')).inc();
  }

  function incRealtimeEventsPublished() {
    realtimeEventsPublishedTotal.inc();
  }

  function incRealtimeRedisPublishFail() {
    realtimeRedisPublishFailTotal.inc();
  }

  function incRealtimeRedisSubscribeError() {
    realtimeRedisSubscribeErrorTotal.inc();
  }

  return {
    promClient,
    registry,
    httpRequestsTotal,
    httpRequestDurationMs,
    httpErrorsTotal,
    bullmqQueueJobs,
    bullmqJobDurationMs,
    bullmqJobFailuresTotal,
    dbQueryDurationMs,
    dbQueriesTotal,
    metricsScrapeErrorsTotal,
    realtimeActiveConnections,
    realtimeConnectsTotal,
    realtimeDisconnectsTotal,
    realtimeDisconnectReasonTotal,
    realtimeEventsPublishedTotal,
    realtimeRedisPublishFailTotal,
    realtimeRedisSubscribeErrorTotal,
    observeHttpRequest,
    setBullmqQueueJobs,
    observeBullmqJobDuration,
    incBullmqJobFailure,
    observeDbQuery,
    incScrapeError,
    setRealtimeActiveConnections,
    incRealtimeConnect,
    incRealtimeDisconnect,
    incRealtimeDisconnectReason,
    incRealtimeEventsPublished,
    incRealtimeRedisPublishFail,
    incRealtimeRedisSubscribeError,
  };
}

const metrics = createMetrics();

module.exports = {
  createMetrics,
  ...metrics,
};
