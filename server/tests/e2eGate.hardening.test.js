const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Mock Supabase before requiring the middleware
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser
    },
    storage: {
      from: () => ({
        upload: jest.fn(),
        remove: jest.fn(),
        list: jest.fn(),
        download: jest.fn(),
        createSignedUrl: jest.fn(),
        createSignedUrls: jest.fn(),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: '' } }))
      })
    }
  })
}));

const app = require('../server');
const { authenticateToken } = require('../middleware/auth');

describe('E2E Gate Hardening', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalE2EFlag = process.env.E2E_ROUTES_ENABLED;

  beforeEach(() => {
    mockGetUser.mockReset();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalE2EFlag == null) {
      delete process.env.E2E_ROUTES_ENABLED;
    } else {
      process.env.E2E_ROUTES_ENABLED = originalE2EFlag;
    }
  });

  test('Production denies E2E routes regardless of flag', async () => {
    process.env.NODE_ENV = 'production';
    process.env.E2E_ROUTES_ENABLED = 'true';

    await request(app)
      .get('/api/test/e2e-verify')
      .expect(404);
  });

  test('Non-prod denies E2E routes by default (flag unset)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.E2E_ROUTES_ENABLED;

    await request(app)
      .get('/api/test/e2e-verify')
      .expect(404);
  });

  test('Non-prod allows E2E routes only when explicitly enabled', async () => {
    process.env.NODE_ENV = 'test';
    process.env.E2E_ROUTES_ENABLED = 'true';

    // When enabled, the endpoint exists and returns a normal E2E response.
    // Without a cookie, the route should respond with a 401 (not 404).
    await request(app)
      .get('/api/test/e2e-verify')
      .expect(401);
  });

  test('Bypass header is ignored unless E2E is enabled', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.E2E_ROUTES_ENABLED;

    const testApp = express();
    testApp.use(cookieParser());
    testApp.use(express.json());

    // If bypass were honored, this would succeed without calling Supabase.
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' }
    });

    testApp.get('/api/test/protected', authenticateToken, (req, res) => {
      res.json({ success: true, authSource: req.authSource, user: req.user });
    });

    const response = await request(testApp)
      .get('/api/test/protected')
      .set('Authorization', 'Bearer totally-invalid-token')
      .set('x-e2e-user-id', '11111111-1111-4111-8111-111111111111')
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid token');
  });
});
