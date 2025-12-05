const request = require('supertest');
const jwt = require('jsonwebtoken');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-e2e';

const app = require('../server');

describe('E2E Verify Endpoint - /api/test/e2e-verify', () => {
  const JWT_SECRET = process.env.JWT_SECRET;
  let testToken;

  beforeEach(() => {
    // Generate a test E2E token
    testToken = jwt.sign({
      sub: '11111111-1111-4111-8111-111111111111',
      username: 'e2e-test',
      role: 'admin',
      email: 'e2e@example.com'
    }, JWT_SECRET, { expiresIn: '24h' });
  });

  describe('Test/Dev Environment', () => {
    beforeEach(() => {
      // Ensure we're in test mode
      process.env.NODE_ENV = 'test';
    });

    test('should return 200 with user when valid E2E cookie present', async () => {
      const response = await request(app)
        .get('/api/test/e2e-verify')
        .set('Cookie', `authToken=${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(response.body.user.email).toBe('e2e@example.com');
      expect(response.body.user.role).toBe('admin');
    });

    test('should return 401 with clean error when no cookie present', async () => {
      const response = await request(app)
        .get('/api/test/e2e-verify')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No session cookie');
      // Ensure no stack trace or internal details
      expect(response.body.stack).toBeUndefined();
    });

    test('should return 401 when cookie has invalid token', async () => {
      const response = await request(app)
        .get('/api/test/e2e-verify')
        .set('Cookie', 'authToken=invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should return 401 when token is not an E2E test token', async () => {
      // Generate a regular user token (not e2e-test-user)
      const regularToken = jwt.sign({
        sub: 'regular-user-123',
        username: 'regularuser',
        role: 'user',
        email: 'regular@example.com'
      }, JWT_SECRET, { expiresIn: '24h' });

      const response = await request(app)
        .get('/api/test/e2e-verify')
        .set('Cookie', `authToken=${regularToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not an E2E session');
    });

    test('should return 401 when token is expired', async () => {
      // Generate an expired token
      const expiredToken = jwt.sign({
        sub: 'e2e-test-user',
        username: 'e2e-test',
        role: 'admin',
        email: 'e2e@example.com'
      }, JWT_SECRET, { expiresIn: '-1h' }); // Expired 1 hour ago

      const response = await request(app)
        .get('/api/test/e2e-verify')
        .set('Cookie', `authToken=${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });
  });

  describe('Production Environment', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    test('should return 403 in production even with valid E2E cookie', async () => {
      const response = await request(app)
        .get('/api/test/e2e-verify')
        .set('Cookie', `authToken=${testToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('E2E verify not allowed in production');
    });

    test('should return 403 in production with no cookie', async () => {
      const response = await request(app)
        .get('/api/test/e2e-verify')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('E2E verify not allowed in production');
    });
  });

  describe('Security', () => {
    test('should not leak stack traces in error responses', async () => {
      const response = await request(app)
        .get('/api/test/e2e-verify')
        .set('Cookie', 'authToken=malformed-jwt-that-causes-error')
        .expect(401);

      expect(response.body.stack).toBeUndefined();
      expect(response.body.trace).toBeUndefined();
      expect(response.body.message).toBeUndefined();
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toBe('Invalid token');
    });

    test('should not accept tokens signed with different secrets', async () => {
      const badToken = jwt.sign({
        sub: 'e2e-test-user',
        username: 'e2e-test',
        role: 'admin',
        email: 'e2e@example.com'
      }, 'different-secret', { expiresIn: '24h' });

      const response = await request(app)
        .get('/api/test/e2e-verify')
        .set('Cookie', `authToken=${badToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Integration with AuthContext', () => {
    test('response format matches expected structure for checkE2ESession', async () => {
      const response = await request(app)
        .get('/api/test/e2e-verify')
        .set('Cookie', `authToken=${testToken}`)
        .expect(200);

      // Ensure response matches the structure expected by AuthContext
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email');
      expect(response.body.user).toHaveProperty('username');
      expect(response.body.user).toHaveProperty('role');
    });
  });
});
