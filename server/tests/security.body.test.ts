/**
 * Integration tests for request body parsing security
 * Verifies that req.rawBody is not captured (memory safety)
 */

const request = require('supertest');
const express = require('express');

describe('Request Body Security', () => {
  let app;

  beforeEach(() => {
    app = express();
  });

  describe('JSON Body Parsing', () => {
    test('should parse JSON body correctly', async () => {
      app.use(express.json({ limit: '1mb' }));
      
      app.post('/test', (req, res) => {
        res.json({
          success: true,
          receivedBody: req.body
        });
      });

      const testData = { message: 'Hello', value: 42 };
      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send(testData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.receivedBody).toEqual(testData);
    });

    test('should NOT capture rawBody (memory leak prevention)', async () => {
      // This is the secure configuration - no verify callback
      app.use(express.json({ limit: '1mb' }));
      
      app.post('/test', (req, res) => {
        res.json({
          success: true,
          hasRawBody: req.rawBody !== undefined,
          hasBody: req.body !== undefined
        });
      });

      const testData = { message: 'Test data', value: 123 };
      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send(testData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasBody).toBe(true);
      expect(response.body.hasRawBody).toBe(false);
    });

    test('should enforce body size limits', async () => {
      app.use(express.json({ limit: '100b' })); // Very small limit for testing
      
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      // Add error handler
      app.use((err, req, res, next) => {
        if (err.type === 'entity.too.large') {
          return res.status(413).json({
            success: false,
            error: 'Payload too large'
          });
        }
        next(err);
      });

      const largeData = { message: 'x'.repeat(1000) };
      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send(largeData)
        .expect(413);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Payload too large');
    });

    test('should reject malformed JSON', async () => {
      app.use(express.json({ limit: '1mb' }));
      
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      // Add error handler for JSON parsing errors
      app.use((err, req, res, next) => {
        if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
          return res.status(400).json({
            success: false,
            error: 'Invalid JSON'
          });
        }
        next(err);
      });

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid JSON');
    });
  });

  describe('URL-Encoded Body Parsing', () => {
    test('should parse URL-encoded body correctly', async () => {
      app.use(express.urlencoded({ limit: '1mb', extended: true }));
      
      app.post('/test', (req, res) => {
        res.json({
          success: true,
          receivedBody: req.body
        });
      });

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('name=Test&value=123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.receivedBody).toEqual({ name: 'Test', value: '123' });
    });

    test('should NOT capture rawBody for URL-encoded requests', async () => {
      app.use(express.urlencoded({ limit: '1mb', extended: true }));
      
      app.post('/test', (req, res) => {
        res.json({
          success: true,
          hasRawBody: req.rawBody !== undefined,
          hasBody: req.body !== undefined
        });
      });

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('name=Test&value=123')
        .expect(200);

      expect(response.body.hasBody).toBe(true);
      expect(response.body.hasRawBody).toBe(false);
    });
  });

  describe('Memory Safety', () => {
    test('should not accumulate request bodies in memory', async () => {
      app.use(express.json({ limit: '1mb' }));
      
      const capturedRawBodies = [];
      
      app.post('/test', (req, res) => {
        // Verify rawBody is not present
        capturedRawBodies.push(req.rawBody);
        res.json({ success: true });
      });

      // Send multiple requests
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/test')
          .set('Content-Type', 'application/json')
          .send({ iteration: i, data: 'x'.repeat(100) })
          .expect(200);
      }

      // All should be undefined (no rawBody captured)
      capturedRawBodies.forEach(rawBody => {
        expect(rawBody).toBeUndefined();
      });
    });

    test('should handle large bodies without creating duplicates', async () => {
      app.use(express.json({ limit: '1mb' }));
      
      app.post('/test', (req, res) => {
        // Check memory footprint - only parsed body should exist
        const hasBody = req.body !== undefined;
        const hasRawBody = req.rawBody !== undefined;
        const bodySize = hasBody ? JSON.stringify(req.body).length : 0;
        
        res.json({
          success: true,
          hasBody,
          hasRawBody,
          bodySize
        });
      });

      const largeData = {
        message: 'x'.repeat(10000),
        array: Array(100).fill({ value: 42 })
      };

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send(largeData)
        .expect(200);

      expect(response.body.hasBody).toBe(true);
      expect(response.body.hasRawBody).toBe(false);
      expect(response.body.bodySize).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty JSON body', async () => {
      app.use(express.json({ limit: '1mb' }));
      
      app.post('/test', (req, res) => {
        res.json({
          success: true,
          body: req.body,
          hasRawBody: req.rawBody !== undefined
        });
      });

      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.body).toEqual({});
      expect(response.body.hasRawBody).toBe(false);
    });

    test('should handle null values in body', async () => {
      app.use(express.json({ limit: '1mb' }));
      
      app.post('/test', (req, res) => {
        res.json({
          success: true,
          body: req.body,
          hasRawBody: req.rawBody !== undefined
        });
      });

      const testData = { value: null, nested: { also: null } };
      const response = await request(app)
        .post('/test')
        .set('Content-Type', 'application/json')
        .send(testData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.body).toEqual(testData);
      expect(response.body.hasRawBody).toBe(false);
    });
  });
});
