const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

describe('Rate limiting', () => {
  let app;
  beforeAll(() => {
    app = express();
    // Apply rate limit to /health for test
    app.get('/health', rateLimit({
      windowMs: 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
    }), (req, res) => res.send('ok'));
  });

  it('should return 429 and rate-limit headers after burst', async () => {
    await request(app).get('/health');
    await request(app).get('/health');
    const res = await request(app).get('/health');
    expect(res.status).toBe(429);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    expect(res.headers['ratelimit-reset']).toBeDefined();
  });
});
