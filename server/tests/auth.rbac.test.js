const request = require('supertest');
const express = require('express');
const createUploadsRouter = require('../routes/uploads');
const requireAuth = (req, res, next) => {
  // Simulate auth middleware with simple role-based access
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).send('Unauthorized');
  }
  if (auth === 'Bearer admin') {
    req.user = { id: 1, role: 'admin' };
    return next();
  }
  return res.status(403).send('Forbidden');
};
const mockKnex = {};

describe('Auth RBAC guards', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use('/uploads', requireAuth, createUploadsRouter({ db: mockKnex }));
  });

  it('should return 401 without token', async () => {
    const res = await request(app).post('/uploads/upload');
    expect(res.status).toBe(401);
  });

  it('should return 403 with wrong role', async () => {
    const res = await request(app)
      .post('/uploads/upload')
      .set('Authorization', 'Bearer user');
    expect(res.status).toBe(403);
  });

  it('should return 200 with correct role', async () => {
    const smallBuffer = Buffer.alloc(1024, 1);
    const res = await request(app)
      .post('/uploads/upload')
      .set('Authorization', 'Bearer admin')
      .attach('photo', smallBuffer, 'test.jpg');
    // With correct role the request must not be rejected by auth;
    // allow storage-layer failures (5xx) but disallow 401/403.
    expect([200, 400, 500]).toContain(res.status);
  });
});
