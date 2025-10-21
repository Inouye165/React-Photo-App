const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { authenticateImageRequest } = require('../middleware/imageAuth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

describe('Image Authentication Middleware', () => {
  let app;
  let validToken;
  let expiredToken;

  beforeAll(() => {
    // Create test tokens
    validToken = jwt.sign(
      { id: 1, username: 'testuser', role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    expiredToken = jwt.sign(
      { id: 1, username: 'testuser', role: 'user' },
      JWT_SECRET,
      { expiresIn: '-1h' } // Already expired
    );

    // Setup test app
    app = express();
    app.use(cookieParser()); // Add cookie parser middleware
    app.use('/test-image', authenticateImageRequest, (req, res) => {
      res.json({ success: true, user: req.user });
    });
  });

  describe('CORS Headers', () => {
    test('should set CORS headers for image requests', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-headers']).toContain('Authorization');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });

    test('should handle OPTIONS preflight requests', async () => {
      const response = await request(app)
        .options('/test-image')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });
  });

  describe('Token Authentication', () => {
    test('should accept valid token in Authorization header', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe('testuser');
    });

    test('should accept valid token in query parameter', async () => {
      const response = await request(app)
        .get(`/test-image?token=${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe('testuser');
    });

    test('should accept valid token in cookie', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Cookie', [`authToken=${validToken}`])
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe('testuser');
    });

    test('should prioritize Authorization header over query parameter', async () => {
      const response = await request(app)
        .get(`/test-image?token=invalid-token`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should prioritize query parameter over cookie', async () => {
      const response = await request(app)
        .get(`/test-image?token=${validToken}`)
        .set('Cookie', ['authToken=invalid-token'])
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Authentication Failures', () => {
    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/test-image')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required for image access');
    });

    test('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should reject request with expired token', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token expired');
    });

    test('should reject malformed Authorization header', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required for image access');
    });

    test('should reject Authorization header without Bearer prefix', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Authorization', validToken)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required for image access');
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty Authorization header', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Authorization', '')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should handle empty query token', async () => {
      const response = await request(app)
        .get('/test-image?token=')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should handle whitespace in token', async () => {
      const response = await request(app)
        .get('/test-image')
        .set('Authorization', `Bearer ${validToken} `)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});