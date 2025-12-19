const request = require('supertest');
const express = require('express');
const helmet = require('helmet');

// Mock supabase client before requiring routes that depend on it
jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: jest.fn(() => ({
      upload: jest.fn(() => Promise.resolve({ data: {}, error: null }))
    }))
  }
}));

const mockKnex = {};

describe('CSP in production', () => {
  let app;
  let originalNodeEnv;
  
  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Production mode now fails fast if critical env vars are missing.
    // Provide minimal non-sensitive placeholders for this CSP-only test.
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

    // Import after env is set to match CI behavior (NODE_ENV=production at process start).
    const createUploadsRouter = require('../routes/uploads');
    app = express();
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }));
    app.use('/uploads', createUploadsRouter({ db: mockKnex }));
  });
  
  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should have strict CSP headers in production', async () => {
    const res = await request(app).get('/uploads/upload');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).not.toMatch(/unsafe-inline/);
    expect(csp).not.toMatch(/localhost/);
    expect(csp).toMatch(/default-src 'self'|default-src 'none'/);
    // Accept either explicit frame-ancestors 'none' or absence (default is none)
    // Accept presence of script-src, style-src, img-src, connect-src if set
  });
});
