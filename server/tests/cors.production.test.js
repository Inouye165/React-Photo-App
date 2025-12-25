/**
 * Production CORS Configuration Tests
 * 
 * These tests verify that the CORS configuration works correctly for:
 * 1. Production Vercel frontend (https://react-photo-app-eta.vercel.app)
 * 2. Local development (http://localhost:5173)
 * 3. Rejecting malicious origins
 * 4. Display endpoints (/display/thumbnails, /display/image)
 * 
 * This verifies proper CORS behavior in production deployments on Railway.
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

describe('Production CORS Configuration', () => {
  let app;
  const originalEnv = process.env;

  // Production Vercel URL
  const PRODUCTION_VERCEL_URL = 'https://react-photo-app-eta.vercel.app';
  const LOCALHOST_DEV_URL = 'http://localhost:5173';

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'production';
    
    // Set FRONTEND_ORIGIN to the production Vercel URL
    process.env.FRONTEND_ORIGIN = PRODUCTION_VERCEL_URL;
    
    // Clear require cache to reload config with new env vars
    delete require.cache[require.resolve('../config/allowedOrigins')];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  /**
   * Helper to create a test app with CORS middleware
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

  describe('Allowed Origin - Production Vercel', () => {
    test('should allow requests from production Vercel frontend', async () => {
      app = createTestApp();
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/test')
        .set('Origin', PRODUCTION_VERCEL_URL)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(PRODUCTION_VERCEL_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.body.success).toBe(true);
    });

    test('should allow requests to /display/thumbnails from Vercel', async () => {
      app = createTestApp();
      app.get('/display/thumbnails/:id', (req, res) => {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .get('/display/thumbnails/test-hash-123.jpg')
        .set('Origin', PRODUCTION_VERCEL_URL)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(PRODUCTION_VERCEL_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['content-type']).toContain('image/jpeg');
    });

    test('should allow requests to /display/image from Vercel', async () => {
      app = createTestApp();
      app.get('/display/image/:id', (req, res) => {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .get('/display/image/456')
        .set('Origin', PRODUCTION_VERCEL_URL)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(PRODUCTION_VERCEL_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['content-type']).toContain('image/jpeg');
    });
  });

  describe('Allowed Origin - Localhost Development', () => {
    test('should allow requests from localhost:5173 (Vite dev server)', async () => {
      app = createTestApp();
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/test')
        .set('Origin', LOCALHOST_DEV_URL)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_DEV_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.body.success).toBe(true);
    });

    test('should allow requests to /display/thumbnails from localhost', async () => {
      app = createTestApp();
      app.get('/display/thumbnails/:id', (req, res) => {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .get('/display/thumbnails/test-hash-123.jpg')
        .set('Origin', LOCALHOST_DEV_URL)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_DEV_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should allow requests to /display/image from localhost', async () => {
      app = createTestApp();
      app.get('/display/image/:id', (req, res) => {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .get('/display/image/456')
        .set('Origin', LOCALHOST_DEV_URL)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_DEV_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('Disallowed Origins', () => {
    test('should reject requests from malicious origins', async () => {
      app = createTestApp();
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/test')
        .set('Origin', 'https://malicious.example.com')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('CORS policy violation');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('should reject requests to /display/thumbnails from malicious origins', async () => {
      app = createTestApp();
      app.get('/display/thumbnails/:id', (req, res) => {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .get('/display/thumbnails/test-hash-123.jpg')
        .set('Origin', 'https://evil.com')
        .expect(403);

      expect(response.body.error).toBe('CORS policy violation');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('should reject requests to /display/image from malicious origins', async () => {
      app = createTestApp();
      app.get('/display/image/:id', (req, res) => {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .get('/display/image/456')
        .set('Origin', 'https://attacker.net')
        .expect(403);

      expect(response.body.error).toBe('CORS policy violation');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('should reject requests from similar but different Vercel URLs', async () => {
      app = createTestApp();
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/test')
        .set('Origin', 'https://react-photo-app-eta-fake.vercel.app')
        .expect(403);

      expect(response.body.error).toBe('CORS policy violation');
    });
  });

  describe('Preflight OPTIONS Requests', () => {
    test('should handle OPTIONS preflight for Vercel origin', async () => {
      app = createTestApp();
      app.get('/display/thumbnails/:id', (req, res) => {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .options('/display/thumbnails/test-hash-123.jpg')
        .set('Origin', PRODUCTION_VERCEL_URL)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(PRODUCTION_VERCEL_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    test('should handle OPTIONS preflight for localhost origin', async () => {
      app = createTestApp();
      app.get('/display/image/:id', (req, res) => {
        res.set('Content-Type', 'image/jpeg');
        res.send(Buffer.from('fake-image-data'));
      });

      const response = await request(app)
        .options('/display/image/456')
        .set('Origin', LOCALHOST_DEV_URL)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(LOCALHOST_DEV_URL);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should reject OPTIONS preflight from disallowed origin', async () => {
      app = createTestApp();
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .options('/api/test')
        .set('Origin', 'https://malicious.example.com')
        .set('Access-Control-Request-Method', 'POST');

      // CORS middleware will reject this - either 403 or no CORS headers
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Config-Level Tests', () => {
    test('should include both Vercel and localhost in allowed origins', () => {
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      expect(allowedOrigins).toContain(PRODUCTION_VERCEL_URL);
      expect(allowedOrigins).toContain(LOCALHOST_DEV_URL);
    });

    test('should not use wildcard origin when credentials are enabled', () => {
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      expect(allowedOrigins).not.toContain('*');
      expect(Array.isArray(allowedOrigins)).toBe(true);
      expect(allowedOrigins.length).toBeGreaterThan(0);
    });

    test('should only include explicitly allowed origins', () => {
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      // All origins should be explicitly configured
      allowedOrigins.forEach(origin => {
        expect(typeof origin).toBe('string');
        expect(origin.startsWith('http://') || origin.startsWith('https://')).toBe(true);
      });
    });
  });

  describe('Server-to-Server Requests (No Origin)', () => {
    test('should allow requests with no Origin header', async () => {
      app = createTestApp();
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });

      // Request without Origin header (e.g., curl, server-to-server)
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
