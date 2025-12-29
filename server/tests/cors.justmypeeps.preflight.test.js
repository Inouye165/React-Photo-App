const request = require('supertest');

/**
 * Regression tests for production CORS + CSRF preflight when the frontend is served from:
 * - https://justmypeeps.org
 * - https://www.justmypeeps.org
 *
 * These tests are intentionally narrow: they only validate CORS headers and OPTIONS preflight
 * behavior for endpoints involved in cookie-based CSRF/token flows.
 */

describe('CORS: justmypeeps.org preflight + CSRF', () => {
  const originalEnv = process.env;

  let app;

  beforeAll(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    // Ensure the server does not start listening in tests.
    process.env.NODE_ENV = 'test';

    // Make sure env loader can run deterministically per test file.
    delete process.env.__SERVER_ENV_LOADED;

    // Use legacy env var path that may exist in Railway today.
    // Include existing known origins plus the two new justmypeeps domains.
    process.env.CORS_ORIGIN = [
      'http://localhost:5173',
      'https://react-photo-app-eta.vercel.app',
      'https://justmypeeps.org',
      'https://www.justmypeeps.org',
    ].join(',');

    // Avoid mixing config modes for this test.
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.CLIENT_ORIGIN;
    delete process.env.CLIENT_ORIGINS;

    app = require('../server');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('OPTIONS /csrf from https://www.justmypeeps.org returns required CORS headers', async () => {
    const res = await request(app)
      .options('/csrf')
      .set('Origin', 'https://www.justmypeeps.org')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'X-CSRF-Token, Content-Type')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe('https://www.justmypeeps.org');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-headers']).toMatch(/x-csrf-token/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/content-type/i);
    expect(res.headers['access-control-allow-methods']).toMatch(/get/i);
  });

  test('GET /csrf from https://justmypeeps.org includes Access-Control-Allow-Origin', async () => {
    const res = await request(app)
      .get('/csrf')
      .set('Origin', 'https://justmypeeps.org')
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe('https://justmypeeps.org');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.body).toHaveProperty('csrfToken');
    expect(typeof res.body.csrfToken).toBe('string');
  });

  test('OPTIONS /api/users/me from https://justmypeeps.org allows Authorization + X-CSRF-Token headers', async () => {
    const res = await request(app)
      .options('/api/users/me')
      .set('Origin', 'https://justmypeeps.org')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization, X-CSRF-Token, Content-Type')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe('https://justmypeeps.org');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/x-csrf-token/i);
  });

  test('Non-allowlisted origin does not receive Access-Control-Allow-Origin', async () => {
    const res = await request(app)
      .options('/csrf')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'X-CSRF-Token, Content-Type');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
