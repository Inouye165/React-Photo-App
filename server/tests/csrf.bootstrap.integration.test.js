const request = require('supertest');

const app = require('../server');

describe('CSRF (csurf) integration', () => {
  const allowedOrigin = 'http://localhost:5173';

  test('unsafe request without token returns 403', async () => {
    const res = await request(app)
      .post('/api/auth/session')
      .set('Origin', allowedOrigin)
      .send({});

    expect(res.status).toBe(403);
  });

  test('unsafe request with token succeeds', async () => {
    const agent = request.agent(app);

    const tokenRes = await agent.get('/csrf').set('Origin', allowedOrigin);
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body).toHaveProperty('csrfToken');
    expect(typeof tokenRes.body.csrfToken).toBe('string');
    expect(tokenRes.body.csrfToken.length).toBeGreaterThan(10);

    const res = await agent
      .post('/api/auth/session')
      .set('Origin', allowedOrigin)
      .set('X-CSRF-Token', tokenRes.body.csrfToken)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});
