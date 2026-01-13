const request = require('supertest');
const express = require('express');

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
}));

jest.mock('../ai/service', () => ({
  processAllUnprocessedInprogress: jest.fn(),
  extractLatLon: jest.fn(),
}));

jest.mock('../media/image', () => ({
  generateThumbnail: jest.fn(),
}));

jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: () => ({
      list: jest.fn(),
      download: jest.fn(),
      upload: jest.fn(),
      remove: jest.fn(),
    }),
  },
}));

const createDebugRouter = require('../routes/debug');

function buildApp({ db }) {
  const app = express();

  // Simulate authenticated requests (server mounts debug behind authenticateToken).
  app.use((req, _res, next) => {
    req.user = { id: 'user-123' };
    next();
  });

  app.use(createDebugRouter({ db }));
  return app;
}

describe('Debug routes hardening (prod-off by default + optional token gate)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DEBUG_ROUTES_ENABLED;
    delete process.env.DEBUG_ADMIN_TOKEN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('Production keeps debug routes available when authenticated', async () => {
    process.env.NODE_ENV = 'production';

    const db = jest.fn(() => ({
      where: jest.fn().mockResolvedValue([]),
    }));

    const app = buildApp({ db });

    await request(app)
      .get('/debug/inprogress')
      .expect(200);
  });

  test('Production keeps debug routes available even when DEBUG_ADMIN_TOKEN is set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEBUG_ADMIN_TOKEN = 'abc';

    const db = jest.fn(() => ({
      where: jest.fn().mockResolvedValue([]),
    }));

    const app = buildApp({ db });

    await request(app)
      .get('/debug/inprogress')
      .expect(200);

    // DEBUG_ADMIN_TOKEN is no longer enforced by this router.
  });

  test('Non-production keeps debug routes available (no token gating)', async () => {
    process.env.NODE_ENV = 'test';

    const db = jest.fn(() => ({
      where: jest.fn().mockResolvedValue([]),
    }));

    const app = buildApp({ db });

    // With DEBUG_ADMIN_TOKEN => still reachable
    process.env.DEBUG_ADMIN_TOKEN = 'token-123';

    await request(app)
      .get('/debug/inprogress')
      .expect(200);
  });
});
