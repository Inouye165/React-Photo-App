const request = require('supertest');
const express = require('express');

// Minimal app for testing CSRF middleware
function createTestApp(allowedOrigins) {
  const app = express();
  // Mock getAllowedOrigins to control allowed origins in tests
  jest.resetModules();
  jest.doMock('../config/allowedOrigins', () => ({
    getAllowedOrigins: () => allowedOrigins
  }));
  const { csrfProtection: freshCsrfProtection } = require('../middleware/csrf');
  app.use(express.json());
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());
  app.use(freshCsrfProtection);
  app.get('/test', (req, res) => res.json({ ok: true }));
  app.post('/test', (req, res) => res.json({ ok: true }));
  return app;
}

describe('CSRF Protection Middleware', () => {
  const allowedOrigins = ['https://good.com'];
  let app;
  beforeEach(() => {
    app = createTestApp(allowedOrigins);
  });

  test('GET request with no Origin (should pass)', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST request with valid Origin and CSRF token (should pass)', async () => {
    const csrfToken = 'test-csrf-token';
    const res = await request(app)
      .post('/test')
      .set('Origin', 'https://good.com')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [`csrfToken=${csrfToken}`]);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST request with Origin: https://evil.com (should fail 403)', async () => {
    const csrfToken = 'test-csrf-token';
    const res = await request(app)
      .post('/test')
      .set('Origin', 'https://evil.com')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [`csrfToken=${csrfToken}`]);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF: Origin not allowed/);
  });

  test('POST request with no Origin/Referer (should fail 403)', async () => {
    const csrfToken = 'test-csrf-token';
    const res = await request(app)
      .post('/test')
      .set('x-csrf-token', csrfToken)
      .set('Cookie', [`csrfToken=${csrfToken}`]);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Origin header required/);
  });

  test('POST request with missing CSRF token (should fail 403)', async () => {
    const res = await request(app)
      .post('/test')
      .set('Origin', 'https://good.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF token mismatch or missing/);
  });

  test('POST request with mismatched CSRF token (should fail 403)', async () => {
    const res = await request(app)
      .post('/test')
      .set('Origin', 'https://good.com')
      .set('x-csrf-token', 'token1')
      .set('Cookie', ['csrfToken=token2']);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF token mismatch or missing/);
  });
});
