const express = require('express');
const request = require('supertest');

const createAuthRouter = require('../routes/auth');

describe('Auth session endpoint (deprecated, no side effects)', () => {
  let app;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter());
  });

  test('POST /api/auth/session returns deprecated no-op response', async () => {
    const res = await request(app)
      .post('/api/auth/session')
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      deprecated: true,
    });
  });

  test('POST /api/auth/session requires Origin header (CSRF protection)', async () => {
    await request(app)
      .post('/api/auth/session')
      .send({})
      .expect(403);
  });

  test('POST /api/auth/session rejects disallowed Origin', async () => {
    await request(app)
      .post('/api/auth/session')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
  });
});
