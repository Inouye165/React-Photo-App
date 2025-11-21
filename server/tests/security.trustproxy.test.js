// Regression test for Express trust proxy setting
const request = require('supertest');

// Import the actual server app
let app;
try {
  app = require('../server');
} catch (e) {
  // If server exports a function, call it
  if (typeof require('../server') === 'function') {
    app = require('../server')();
  } else {
    throw e;
  }
}

describe('Security: trust proxy', () => {
  // Add a test-only endpoint to echo req.ip
  beforeAll(() => {
    if (!app._router.stack.some(r => r.route && r.route.path === '/test-ip')) {
      app.get('/test-ip', (req, res) => {
        res.json({ ip: req.ip, ips: req.ips, trustProxy: app.get('trust proxy') });
      });
    }
  });

  it('should resolve client IP from X-Forwarded-For when trust proxy is set', async () => {
    const testIp = '123.123.123.123';
    const res = await request(app)
      .get('/test-ip')
      .set('X-Forwarded-For', testIp)
      .expect(200);
    expect(res.body).toHaveProperty('ip');
    expect(res.body.ip).toBe(testIp);
    expect(res.body.trustProxy === 1 || res.body.trustProxy === true).toBe(true);
  });

  it('should fallback to remote address if no X-Forwarded-For', async () => {
    const res = await request(app)
      .get('/test-ip')
      .expect(200);
    expect(res.body).toHaveProperty('ip');
    // Should be ::ffff:127.0.0.1 or 127.0.0.1 in most test envs
    expect(res.body.ip).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
  });
});
