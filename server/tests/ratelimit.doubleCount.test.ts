const request = require('supertest');
const express = require('express');

jest.setTimeout(20000);

describe('Rate limiter overlap regression', () => {
  test('does not throw ERR_ERL_DOUBLE_COUNT for /api/auth when security + auth router are both mounted', async () => {
    // Ensure test env so auth limiter uses relaxed limits.
    process.env.NODE_ENV = 'test';

    // Important: require after NODE_ENV is set because some modules read it at load time.
    const { configureSecurity } = require('../middleware/security');
    const createAuthRouter = require('../routes/auth');

    const app = express();
    app.use(express.json());

    configureSecurity(app);

    // Auth routes have their own strict rate limiter.
    app.use('/api/auth', createAuthRouter());

    const response = await request(app)
      .post('/api/auth/session')
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(200);

    expect(response.body).toBeDefined();
  });

  test('does not throw ERR_ERL_DOUBLE_COUNT for /api/public contact when both security + public router are mounted', async () => {
    process.env.NODE_ENV = 'test';

    const { configureSecurity } = require('../middleware/security');
    const createPublicRouter = require('../routes/public');

    const mockDb = jest.fn(() => ({
      insert: jest.fn(() => ({
        returning: jest.fn().mockResolvedValue([{ id: 1, created_at: '2025-01-01T00:00:00Z' }]),
      })),
    }));

    const app = express();
    app.use(express.json());

    configureSecurity(app);

    // Public routes have their own rate limiter per endpoint.
    app.use('/api/public', createPublicRouter({ db: mockDb }));

    const response = await request(app)
      .post('/api/public/contact')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Hello',
        message: 'Test message',
      })
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
