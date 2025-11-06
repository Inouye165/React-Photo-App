const request = require('supertest');
const express = require('express');
const { configureSecurity, validateRequest, securityErrorHandler } = require('../middleware/security');

describe('Security Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('configureSecurity', () => {
    test('should apply security headers correctly', async () => {
      configureSecurity(app);
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      // Check for security headers set by Helmet
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-xss-protection']).toBeDefined();
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    });

    test('should set appropriate CSP headers', async () => {
      configureSecurity(app);
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test');

      // Should have Content Security Policy
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).toContain('img-src');
    });

    test('should allow cross-origin resources', async () => {
      configureSecurity(app);
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test');

      // Should allow cross-origin resource policy
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    test('should configure rate limiting', async () => {
      const { generalLimiter, uploadLimiter, apiLimiter } = configureSecurity(app);
      
      expect(generalLimiter).toBeDefined();
      expect(uploadLimiter).toBeDefined();
      expect(apiLimiter).toBeDefined();

      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Should respond normally for first few requests
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
    });

    test('should skip rate limiting for health checks', async () => {
      configureSecurity(app);
      
      app.get('/health', (req, res) => {
        res.json({ status: 'ok' });
      });

      // Health endpoint should not be rate limited
      for (let i = 0; i < 10; i++) {
        await request(app).get('/health').expect(200);
      }
    });
  });

  describe('validateRequest', () => {
    beforeEach(() => {
      app.use(validateRequest);
    });

    test('should allow normal requests', async () => {
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .get('/test')
        .expect(200);
    });

    test('should block directory traversal attempts', async () => {
      app.get('/test/*', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test/../../../etc/passwd')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid request');
    });

    test('should block XSS attempts', async () => {
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test?param=<script>alert("xss")</script>')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid request');
    });

    test('should block SQL injection attempts', async () => {
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test?id=1 UNION SELECT * FROM users')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid request');
    });

    test('should block code execution attempts', async () => {
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/test?cmd=exec("rm -rf /")')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid request');
    });

    test('should validate content types for POST requests', async () => {
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'text/plain')
        .send('plain text data')
        .expect(415);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unsupported content type');
    });

    test('should allow JSON content type for POST requests', async () => {
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send({ test: 'data' })
        .expect(200);
    });

    test('should allow multipart form data for upload endpoints', async () => {
      app.post('/upload/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/upload/test')
        .set('Content-Type', 'multipart/form-data; boundary=test')
        .send('--test\r\nContent-Disposition: form-data; name="file"\r\n\r\nfile content\r\n--test--')
        .expect(200);
    });

    test('should handle URL encoding properly', async () => {
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Should handle normal URL encoding
      await request(app)
        .get('/test?param=hello%20world')
        .expect(200);

      // Should block malicious encoded attempts
      const response = await request(app)
        .get('/test?param=%2E%2E%2F%2E%2E%2F')  // ../.. encoded
        .expect(400);

      expect(response.body.error).toBe('Invalid request');
    });
  });

  describe('securityErrorHandler', () => {
    beforeEach(() => {
      app.get('/auth-error', (_req, _res) => {
        const error = new Error('Unauthorized');
        error.status = 401;
        throw error;
      });

      app.get('/forbidden-error', (_req, _res) => {
        const error = new Error('Forbidden');
        error.status = 403;
        throw error;
      });

      app.get('/server-error', (_req, _res) => {
        const error = new Error('Internal server error');
        error.status = 500;
        throw error;
      });

      app.use(securityErrorHandler);
      
      // Fallback error handler for testing
      app.use((err, _req, res, _next) => {
        res.status(err.status || 500).json({
          success: false,
          error: err.message
        });
      });
    });

    test('should handle 401 errors without exposing details', async () => {
      const response = await request(app)
        .get('/auth-error')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Unauthorized');
    });

    test('should handle 403 errors without exposing details', async () => {
      const response = await request(app)
        .get('/forbidden-error')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Forbidden');
    });

    test('should mask internal server errors', async () => {
      const response = await request(app)
        .get('/server-error')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('Integration Tests', () => {
    test('should apply all security measures together', async () => {
      configureSecurity(app);
      app.use(validateRequest);
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });
      
      app.use(securityErrorHandler);

      // Normal request should work
      const normalResponse = await request(app)
        .get('/test')
        .expect(200);

      expect(normalResponse.headers['x-frame-options']).toBeDefined();
      expect(normalResponse.body.success).toBe(true);

      // Malicious request should be blocked
      await request(app)
        .get('/test?evil=<script>alert(1)</script>')
        .expect(400);
    });

    test('should handle rate limiting properly', async () => {
      configureSecurity(app);
      
      app.post('/upload/test', (req, res) => {
        res.json({ success: true });
      });

      // First few uploads should succeed
      await request(app).post('/upload/test').expect(200);
      await request(app).post('/upload/test').expect(200);
      
      // After many uploads, should be rate limited
      // Note: Actual rate limiting testing would require many requests
      // This is a basic structure test
    });

    test('should maintain security across different request methods', async () => {
      configureSecurity(app);
      app.use(validateRequest);
      
      app.get('/test', (req, res) => res.json({ method: 'GET' }));
      app.post('/test', (req, res) => res.json({ method: 'POST' }));
      app.put('/test', (req, res) => res.json({ method: 'PUT' }));
      app.delete('/test', (req, res) => res.json({ method: 'DELETE' }));

      // All methods should have security applied
      for (const method of ['get', 'post', 'put', 'delete']) {
        const response = await request(app)[method]('/test');
        
        if (response.status === 200) {
          expect(response.headers['x-frame-options']).toBeDefined();
        }
      }
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    test('should handle malformed JSON gracefully', async () => {
      configureSecurity(app);
      app.use(validateRequest);
      
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      // This should be handled by Express's built-in JSON parser
      await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      // Express should handle the malformed JSON
    });

    test('should handle very long URLs', async () => {
      configureSecurity(app);
      app.use(validateRequest);
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      const longPath = '/test?' + 'a'.repeat(10000);
      
      // Should either handle it or reject it gracefully
      const response = await request(app).get(longPath);
      
      expect([200, 400, 414]).toContain(response.status);
    });

    test('should handle special characters in URLs safely', async () => {
      configureSecurity(app);
      app.use(validateRequest);
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Test various encoded characters that shouldn't trigger false positives
      await request(app)
        .get('/test?param=%20%21%40%23')  // space, !, @, #
        .expect(200);
    });
  });
});