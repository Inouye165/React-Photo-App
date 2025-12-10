/**
 * Integration tests for CORS security configuration
 * Tests that CORS origin validation works correctly with allowlist
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');

describe('CORS Security', () => {
  let app;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set NODE_ENV to production to disable regex bypass logic
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.CLIENT_ORIGIN;
    delete process.env.CLIENT_ORIGINS;
    delete process.env.DEBUG_CORS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Allowed Origins', () => {
    test('should allow requests from origins in ALLOWED_ORIGINS', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://staging.example.com';
      
      // Reload the module to pick up new env vars
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://app.example.com')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(response.body.success).toBe(true);
    });

    test('should allow requests with no Origin header (server-to-server)', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Request without Origin header (e.g., curl, server-to-server)
      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should allow default localhost origins in any environment', async () => {
      // No ALLOWED_ORIGINS set, should use defaults
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Test Vite default port
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.body.success).toBe(true);
    });
  });

  describe('Blocked Origins', () => {
    test('should reject requests from origins not in allowlist', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      process.env.NODE_ENV = 'production'; // Ensure production mode
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Add error handler to catch CORS errors
      app.use((err, req, res, next) => {
        if (err.message === 'Not allowed by CORS') {
          return res.status(403).json({
            success: false,
            error: 'CORS policy violation'
          });
        }
        next(err);
      });

      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://evil.com')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('CORS policy violation');
    });

    test('should reject LAN IPs in production (no regex bypass)', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      process.env.NODE_ENV = 'production';
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      app.use((err, req, res, next) => {
        if (err.message === 'Not allowed by CORS') {
          return res.status(403).json({
            success: false,
            error: 'CORS policy violation'
          });
        }
        next(err);
      });

      // Test various LAN IPs that should be blocked
      const blockedOrigins = [
        'http://192.168.1.100:5173',
        'http://10.0.0.50:5173',
        'http://172.16.0.100:5173',
        'http://127.0.0.1:8080'
      ];

      for (const origin of blockedOrigins) {
        const response = await request(app)
          .get('/test')
          .set('Origin', origin);
        
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('CORS policy violation');
      }
    });

    test('should reject requests with mismatched ports', async () => {
      process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
      process.env.NODE_ENV = 'production';
      
      // Clear require cache to get fresh config
      delete require.cache[require.resolve('../config/allowedOrigins')];
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      app.use((err, req, res, next) => {
        if (err.message === 'Not allowed by CORS') {
          return res.status(403).json({
            success: false,
            error: 'CORS policy violation'
          });
        }
        next(err);
      });

      // Port 5174 should be rejected when only 5173 is allowed
      const response = await request(app)
        .get('/test')
        .set('Origin', 'http://localhost:5174')
        .expect(403);

      expect(response.body.error).toBe('CORS policy violation');
    });
  });

  describe('CORS Headers', () => {
    test('should include credentials header when origin is allowed', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://app.example.com')
        .expect(200);

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should handle preflight OPTIONS requests correctly', async () => {
      process.env.ALLOWED_ORIGINS = 'https://app.example.com';
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        optionsSuccessStatus: 204
      }));

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .options('/test')
        .set('Origin', 'https://app.example.com')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
    });
  });

  describe('Vercel Frontend Origin', () => {
    const VERCEL_ORIGIN = 'https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app';

    test('should allow Vercel origin when set via FRONTEND_ORIGIN', async () => {
      process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/api/auth/session', (req, res) => {
        res.json({ success: true, user: { id: 1 } });
      });

      const response = await request(app)
        .get('/api/auth/session')
        .set('Origin', VERCEL_ORIGIN)
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.body.success).toBe(true);
    });

    test('should allow Vercel origin via OPTIONS preflight request', async () => {
      process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        optionsSuccessStatus: 204
      }));

      app.post('/api/auth/session', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .options('/api/auth/session')
        .set('Origin', VERCEL_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should allow both localhost and Vercel when FRONTEND_ORIGIN is set (no ALLOWED_ORIGINS)', async () => {
      process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/api/auth/session', (req, res) => {
        res.json({ success: true });
      });

      // Test Vercel origin
      const vercelResponse = await request(app)
        .get('/api/auth/session')
        .set('Origin', VERCEL_ORIGIN)
        .expect(200);
      expect(vercelResponse.headers['access-control-allow-origin']).toBe(VERCEL_ORIGIN);

      // Test localhost (should still work with defaults)
      const localhostResponse = await request(app)
        .get('/api/auth/session')
        .set('Origin', 'http://localhost:5173')
        .expect(200);
      expect(localhostResponse.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    test('should reject evil.example.com even when Vercel is allowed', async () => {
      process.env.FRONTEND_ORIGIN = VERCEL_ORIGIN;
      
      const { getAllowedOrigins } = require('../config/allowedOrigins');
      const allowedOrigins = getAllowedOrigins();

      app = express();
      app.use(cors({
        origin: function(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, origin);
          }
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      }));

      app.get('/api/auth/session', (req, res) => {
        res.json({ success: true });
      });

      app.use((err, req, res, next) => {
        if (err.message === 'Not allowed by CORS') {
          return res.status(403).json({
            success: false,
            error: 'CORS policy violation'
          });
        }
        next(err);
      });

      const response = await request(app)
        .get('/api/auth/session')
        .set('Origin', 'https://evil.example.com')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('CORS policy violation');
    });
  });
});
