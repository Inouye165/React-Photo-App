/**
 * CORS Integration Tests
 * 
 * Comprehensive test coverage for CORS configuration:
 * - Test A: Localhost origin allowed (http://localhost:5173)
 * - Test B: Vercel production origin allowed (https://react-photo-app-eta.vercel.app)
 * - Test C: Disallowed origin rejected (https://evil.example.com)
 * - Test D: OPTIONS preflight for state-changing endpoints
 * - Test E: Display endpoint CORS with allowed origin
 * - Test F: Display endpoint CORS with disallowed origin
 * - Test G: Auth endpoint origin verification
 * - Test H: getAllowedOrigins() respects env configuration
 * - Test I: Single authoritative Access-Control-Allow-Origin header
 * 
 * These tests ensure the CORS configuration works correctly for:
 * - Local development (localhost:5173)
 * - Production (Vercel frontend)
 * - Secure rejection of unknown origins
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Constants for testing
const LOCALHOST_ORIGIN = 'http://localhost:5173';
const VERCEL_ORIGIN = 'https://react-photo-app-eta.vercel.app';
const EVIL_ORIGIN = 'https://evil.example.com';

describe('CORS Integration Tests', () => {
  let app;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set NODE_ENV to production to test production behavior
    process.env.NODE_ENV = 'production';
    // Configure production frontend origin
    process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
    // Clear other CORS env vars
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.CLIENT_ORIGIN;
    delete process.env.CLIENT_ORIGINS;
    delete process.env.DEBUG_CORS;
    
    // Clear require cache to reload config with new env vars
    delete require.cache[require.resolve('../config/allowedOrigins')];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  /**
   * Helper to create a test app with CORS middleware (matches server.js config)
   */
  function createTestApp() {
    const { getAllowedOrigins } = require('../config/allowedOrigins');
    const allowedOrigins = getAllowedOrigins();

    const testApp = express();
    testApp.use(cookieParser());
    testApp.use(cors({
      origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, origin);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      optionsSuccessStatus: 204
    }));

    // Error handler for CORS errors
    testApp.use((err, req, res, next) => {
      if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
          success: false,
          error: 'CORS policy violation'
        });
      }
      next(err);
    });

    return testApp;
  }

  /**
   * Test A: Localhost origin allowed
   * Verifies that http://localhost:5173 (Vite dev server) is allowed
   */
  describe('Test A: Localhost origin allowed', () => {
    test('should allow requests from http://localhost:5173', async () => {
      app = createTestApp();
      app.get('/health', (req, res) => {
        res.json({ success: true, status: 'healthy' });
      });

      const response = await request(app)
        .get('/health')
        .set('Origin', LOCALHOST_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.body.success).toBe(true);
    });

    test('should allow GET /photos from localhost', async () => {
      app = createTestApp();
      app.get('/photos', (req, res) => {
        res.json({ success: true, photos: [] });
      });

      const response = await request(app)
        .get('/photos')
        .set('Origin', LOCALHOST_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  /**
   * Test B: Vercel origin allowed
   * Verifies that https://react-photo-app-eta.vercel.app is allowed
   */
  describe('Test B: Vercel origin allowed', () => {
    test('should allow requests from Vercel production frontend', async () => {
      app = createTestApp();
      app.get('/health', (req, res) => {
        res.json({ success: true, status: 'healthy' });
      });

      const response = await request(app)
        .get('/health')
        .set('Origin', VERCEL_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.body.success).toBe(true);
    });

    test('should allow GET /photos from Vercel', async () => {
      app = createTestApp();
      app.get('/photos', (req, res) => {
        res.json({ success: true, photos: [] });
      });

      const response = await request(app)
        .get('/photos')
        .set('Origin', VERCEL_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  /**
   * Test C: Disallowed origin rejected
   * Verifies that unknown/malicious origins are rejected
   */
  describe('Test C: Disallowed origin rejected', () => {
    test('should reject requests from evil.example.com', async () => {
      app = createTestApp();
      app.get('/health', (req, res) => {
        res.json({ success: true, status: 'healthy' });
      });

      const response = await request(app)
        .get('/health')
        .set('Origin', EVIL_ORIGIN)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('CORS policy violation');
      // Should NOT have Access-Control-Allow-Origin header for rejected origin
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('should not leak sensitive info when rejecting origin', async () => {
      app = createTestApp();
      app.get('/api/secret', (req, res) => {
        res.json({ success: true, secret: 'top-secret-data' });
      });

      const response = await request(app)
        .get('/api/secret')
        .set('Origin', EVIL_ORIGIN)
        .expect(403);

      // Response should only contain error message, no sensitive data
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('CORS policy violation');
      expect(response.body.secret).toBeUndefined();
    });

    test('should reject similar but different Vercel URLs', async () => {
      app = createTestApp();
      app.get('/health', (req, res) => {
        res.json({ success: true });
      });

      const fakeVercel = 'https://react-photo-app-eta-fake.vercel.app';
      const response = await request(app)
        .get('/health')
        .set('Origin', fakeVercel)
        .expect(403);

      expect(response.body.error).toBe('CORS policy violation');
    });
  });

  /**
   * Test D: OPTIONS preflight for state-changing endpoints
   * Verifies that preflight requests are handled correctly
   */
  describe('Test D: OPTIONS preflight requests', () => {
    test('should handle OPTIONS preflight for POST /api/auth/login', async () => {
      app = createTestApp();
      app.post('/api/auth/login', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', VERCEL_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should handle OPTIONS preflight from localhost', async () => {
      app = createTestApp();
      app.post('/upload', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .options('/upload')
        .set('Origin', LOCALHOST_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should reject OPTIONS preflight from disallowed origin', async () => {
      app = createTestApp();
      app.post('/api/auth/login', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .options('/api/auth/login')
        .set('Origin', EVIL_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');

      // CORS middleware rejects - no allow-origin header
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  /**
   * Test E: Display endpoint CORS with allowed origin
   * Verifies that /display/* routes work with allowed origins
   */
  describe('Test E: Display endpoint CORS - allowed origin', () => {
    test('should allow GET /display/image/:id from Vercel', async () => {
      app = createTestApp();
      app.get('/display/image/:id', (req, res) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .get('/display/image/123')
        .set('Origin', VERCEL_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should allow GET /display/thumbnails/:hash from localhost', async () => {
      app = createTestApp();
      app.get('/display/thumbnails/:hash', (req, res) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-thumbnail-data'));
      });

      const response = await request(app)
        .get('/display/thumbnails/abc123.jpg')
        .set('Origin', LOCALHOST_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_ORIGIN);
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });
  });

  /**
   * Test F: Display endpoint CORS with disallowed origin
   * Verifies that /display/* routes reject unknown origins
   */
  describe('Test F: Display endpoint CORS - disallowed origin', () => {
    test('should reject GET /display/image/:id from evil origin', async () => {
      app = createTestApp();
      app.get('/display/image/:id', (req, res) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .get('/display/image/123')
        .set('Origin', EVIL_ORIGIN)
        .expect(403);

      expect(response.body.error).toBe('CORS policy violation');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('should reject GET /display/thumbnails/:hash from evil origin', async () => {
      app = createTestApp();
      app.get('/display/thumbnails/:hash', (req, res) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-thumbnail-data'));
      });

      const response = await request(app)
        .get('/display/thumbnails/abc123.jpg')
        .set('Origin', EVIL_ORIGIN)
        .expect(403);

      expect(response.body.error).toBe('CORS policy violation');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  /**
   * Test G: Auth endpoint origin verification
   * Verifies that auth routes accept both allowed origins and reject others
   */
  describe('Test G: Auth endpoint origin verification', () => {
    test('should accept POST /api/auth/session from localhost', async () => {
      app = createTestApp();
      app.post('/api/auth/session', (req, res) => {
        res.json({ success: true, message: 'Session created' });
      });

      const response = await request(app)
        .post('/api/auth/session')
        .set('Origin', LOCALHOST_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ token: 'test-token' })
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_ORIGIN);
      expect(response.body.success).toBe(true);
    });

    test('should accept POST /api/auth/session from Vercel', async () => {
      app = createTestApp();
      app.post('/api/auth/session', (req, res) => {
        res.json({ success: true, message: 'Session created' });
      });

      const response = await request(app)
        .post('/api/auth/session')
        .set('Origin', VERCEL_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ token: 'test-token' })
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);
      expect(response.body.success).toBe(true);
    });

    test('should reject POST /api/auth/session from evil origin', async () => {
      app = createTestApp();
      app.post('/api/auth/session', (req, res) => {
        res.json({ success: true, message: 'Session created' });
      });

      const response = await request(app)
        .post('/api/auth/session')
        .set('Origin', EVIL_ORIGIN)
        .set('Content-Type', 'application/json')
        .send({ token: 'test-token' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('CORS policy violation');
      // Should not return sensitive info
      expect(response.body.message).toBeUndefined();
    });
  });

  /**
   * Test H: getAllowedOrigins() respects env configuration
   * Verifies that the config module correctly parses environment variables
   */
  describe('Test H: getAllowedOrigins() respects env configuration', () => {
    test('should include both localhost and Vercel when FRONTEND_ORIGIN is set', () => {
      process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
      delete require.cache[require.resolve('../config/allowedOrigins')];
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      expect(allowedOrigins).toContain(VERCEL_ORIGIN);
      expect(allowedOrigins).toContain(LOCALHOST_ORIGIN);
    });

    test('should parse ALLOWED_ORIGINS correctly', () => {
      process.env.ALLOWED_ORIGINS = 'https://app1.example.com,https://app2.example.com';
      process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
      delete require.cache[require.resolve('../config/allowedOrigins')];
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      expect(allowedOrigins).toContain('https://app1.example.com');
      expect(allowedOrigins).toContain('https://app2.example.com');
      expect(allowedOrigins).toContain(VERCEL_ORIGIN);
    });

    test('should handle trailing commas and spaces in ALLOWED_ORIGINS', () => {
      process.env.ALLOWED_ORIGINS = ' https://app.example.com , https://staging.example.com, ';
      delete require.cache[require.resolve('../config/allowedOrigins')];
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      expect(allowedOrigins).toContain('https://app.example.com');
      expect(allowedOrigins).toContain('https://staging.example.com');
      // Should not contain empty strings
      expect(allowedOrigins.filter(o => o === '')).toHaveLength(0);
    });

    test('should not include wildcard (*) in allowed origins', () => {
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      expect(allowedOrigins).not.toContain('*');
    });
  });

  /**
   * Test I: Single authoritative Access-Control-Allow-Origin header
   * Verifies no duplicate or conflicting CORS headers
   */
  describe('Test I: Single authoritative Access-Control-Allow-Origin header', () => {
    test('should have exactly one Access-Control-Allow-Origin header value', async () => {
      app = createTestApp();
      
      // Middleware that also tries to set CORS headers (simulating imageAuth)
      app.use((req, res, next) => {
        // This should NOT override the cors() middleware
        // In production, imageAuth uses resolveAllowedOrigin which is consistent
        next();
      });
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Origin', VERCEL_ORIGIN)
        .expect(200);

      // Should be exactly the request origin, not localhost:5173
      expect(response.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);
      
      // Verify it's not a comma-separated list (which would indicate duplicates)
      expect(response.headers['access-control-allow-origin']).not.toContain(',');
    });

    test('should echo back the allowed origin, not a hardcoded value', async () => {
      app = createTestApp();
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Test with localhost
      const localhostResponse = await request(app)
        .get('/test')
        .set('Origin', LOCALHOST_ORIGIN)
        .expect(200);
      expect(localhostResponse.headers['access-control-allow-origin']).toBe(LOCALHOST_ORIGIN);

      // Test with Vercel
      const vercelResponse = await request(app)
        .get('/test')
        .set('Origin', VERCEL_ORIGIN)
        .expect(200);
      expect(vercelResponse.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);

      // Both should be their respective origins, not a hardcoded default
    });
  });

  /**
   * Additional: Server-to-server requests (no Origin header)
   */
  describe('Server-to-server requests (no Origin header)', () => {
    test('should allow requests without Origin header', async () => {
      app = createTestApp();
      app.get('/health', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      // No Origin header means no Access-Control-Allow-Origin is set (or undefined)
    });
  });
});

/**
 * Tests for resolveAllowedOrigin helper
 */
describe('resolveAllowedOrigin helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
    delete process.env.ALLOWED_ORIGINS;
    delete require.cache[require.resolve('../config/allowedOrigins')];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should return origin unchanged if allowed', () => {
    const { resolveAllowedOrigin } = require('../config/allowedOrigins');
    
    expect(resolveAllowedOrigin(LOCALHOST_ORIGIN)).toBe(LOCALHOST_ORIGIN);
    expect(resolveAllowedOrigin(VERCEL_ORIGIN)).toBe(VERCEL_ORIGIN);
  });

  test('should return null for disallowed origin', () => {
    const { resolveAllowedOrigin } = require('../config/allowedOrigins');
    
    expect(resolveAllowedOrigin(EVIL_ORIGIN)).toBeNull();
    expect(resolveAllowedOrigin('https://malicious.com')).toBeNull();
  });

  test('should return null for undefined/null origin', () => {
    const { resolveAllowedOrigin } = require('../config/allowedOrigins');
    
    expect(resolveAllowedOrigin(undefined)).toBeNull();
    expect(resolveAllowedOrigin(null)).toBeNull();
  });

  test('should return null for literal "null" string origin (sandboxed iframe, file://, etc.)', () => {
    const { resolveAllowedOrigin } = require('../config/allowedOrigins');
    
    // SECURITY: Browsers send Origin: null in certain privacy contexts.
    // We must never allow this to be set as Access-Control-Allow-Origin with credentials.
    expect(resolveAllowedOrigin('null')).toBeNull();
  });
});

/**
 * Tests for isOriginAllowed helper
 */
describe('isOriginAllowed helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
    delete process.env.ALLOWED_ORIGINS;
    delete require.cache[require.resolve('../config/allowedOrigins')];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should return true for allowed origins', () => {
    const { isOriginAllowed } = require('../config/allowedOrigins');
    
    expect(isOriginAllowed(LOCALHOST_ORIGIN)).toBe(true);
    expect(isOriginAllowed(VERCEL_ORIGIN)).toBe(true);
  });

  test('should return false for disallowed origins', () => {
    const { isOriginAllowed } = require('../config/allowedOrigins');
    
    expect(isOriginAllowed(EVIL_ORIGIN)).toBe(false);
    expect(isOriginAllowed('https://malicious.com')).toBe(false);
  });

  test('should return true for undefined/null origin (server-to-server)', () => {
    const { isOriginAllowed } = require('../config/allowedOrigins');
    
    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed(null)).toBe(true);
  });

  test('should return false for literal "null" string origin', () => {
    const { isOriginAllowed } = require('../config/allowedOrigins');
    
    // SECURITY: The literal string "null" is NOT the same as no origin.
    // It should be rejected since it's not in the allowlist.
    expect(isOriginAllowed('null')).toBe(false);
  });});