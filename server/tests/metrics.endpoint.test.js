/* eslint-env jest */

const request = require('supertest');

describe('GET /metrics (Prometheus)', () => {
  jest.setTimeout(20000);

  let app;

  beforeEach(() => {
    process.env.METRICS_TOKEN = 'test-metrics-token';
    process.env.METRICS_ALLOW_LOCALHOST = 'false';
  });

  beforeAll(() => {
    app = require('../server');
  });

  test('is protected (no token => 401/403)', async () => {
    const res = await request(app).get('/metrics');
    expect([401, 403]).toContain(res.status);
  });

  test('with token => 200, text/plain; version=0.0.4 and expected metric names', async () => {
    // Generate at least one request with a numeric path segment.
    await request(app).get('/photos/123');

    const res = await request(app)
      .get('/metrics')
      .set('X-Metrics-Token', process.env.METRICS_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toEqual(expect.stringContaining('text/plain'));
    expect(res.headers['content-type']).toEqual(expect.stringContaining('version=0.0.4'));

    const body = res.text;

    // Required metric names
    expect(body).toEqual(expect.stringContaining('http_requests_total'));
    expect(body).toEqual(expect.stringContaining('http_request_duration_ms_bucket'));
    expect(body).toEqual(expect.stringContaining('http_errors_total'));

    expect(body).toEqual(expect.stringContaining('bullmq_queue_jobs'));
    // Note: histograms with no observations may not include *_bucket lines.
    expect(body).toEqual(expect.stringContaining('# HELP bullmq_job_duration_ms'));
    expect(body).toEqual(expect.stringContaining('# TYPE bullmq_job_duration_ms histogram'));
    expect(body).toEqual(expect.stringContaining('bullmq_job_failures_total'));

    expect(body).toEqual(expect.stringContaining('# HELP db_query_duration_ms'));
    expect(body).toEqual(expect.stringContaining('# TYPE db_query_duration_ms histogram'));
    expect(body).toEqual(expect.stringContaining('db_queries_total'));

    // Forbidden high-cardinality strings/labels
    expect(body).not.toEqual(expect.stringContaining('requestId'));

    // Ensure raw numeric path segments are not used as labels
    expect(body).not.toMatch(/\/photos\/\d+/);
  });
});
