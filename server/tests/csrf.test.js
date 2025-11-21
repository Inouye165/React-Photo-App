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

  test('POST request with valid Origin (should pass)', async () => {
    const res = await request(app)
      .post('/test')
      .set('Origin', 'https://good.com');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST request with Origin: https://evil.com (should fail 403)', async () => {
    const res = await request(app)
      .post('/test')
      .set('Origin', 'https://evil.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF: Origin not allowed/);
  });

  test('POST request with no Origin/Referer (should fail 403)', async () => {
    const res = await request(app)
      .post('/test');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Origin header required/);
  });
});
