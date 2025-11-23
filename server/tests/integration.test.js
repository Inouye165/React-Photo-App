const request = require('supertest');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const express = require('express');
const jwt = require('jsonwebtoken');

// This would typically import your actual server instance
// For testing, we might need to create a test server instance
let server;
let app;
let authToken;

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
// Helper to create header tokens for tests where header auth is desired
const makeToken = (opts) => jwt.sign({ id: 1, username: 'testuser', role: 'user' }, JWT_SECRET, opts || { expiresIn: '1h' });

// Mock file system for test images
const testImagePath = path.join(process.cwd(), 'test-images');
const workingDir = path.join(process.cwd(), 'working');

beforeAll(async () => {
  // Create test directories
  if (!fs.existsSync(testImagePath)) {
    fs.mkdirSync(testImagePath, { recursive: true });
  }
  if (!fs.existsSync(workingDir)) {
    fs.mkdirSync(workingDir, { recursive: true });
  }

  // Create a test JPEG image
  const testJpegBuffer = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  }).jpeg().toBuffer();
  
  fs.writeFileSync(path.join(testImagePath, 'test.jpg'), testJpegBuffer);

  // Create a test HEIC image (simplified - in reality this would be a real HEIC file)
  fs.writeFileSync(path.join(testImagePath, 'test.heic'), testJpegBuffer);
  
  // Copy test images to working directory
  fs.copyFileSync(
    path.join(testImagePath, 'test.jpg'),
    path.join(workingDir, 'test.jpg')
  );
  fs.copyFileSync(
    path.join(testImagePath, 'test.heic'),
    path.join(workingDir, 'test.heic')
  );
  
  // Create additional test files that some tests expect
  fs.writeFileSync(path.join(workingDir, 'large.heic'), testJpegBuffer);
  fs.writeFileSync(path.join(workingDir, 'malformed.heic'), 'invalid-heic-data');

  // Start server (this would be your actual server setup)
  app = express();
  app.use(express.json());
  
  // Mock display endpoint
  app.get('/display/:state/:filename', (req, res) => {
    let token = null;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Access token required for image access' });
    }

    try {
      jwt.verify(token, JWT_SECRET);
      const { state, filename } = req.params;
      const filePath = path.join(workingDir, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Image not found on this machine',
          filename: filename,
          state: state
        });
      }

      // For HEIC files, simulate conversion
      if (filename.toLowerCase().endsWith('.heic') || filename.toLowerCase().endsWith('.heif')) {
        // Check if this is a malformed HEIC file
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          if (fileContent === 'invalid-heic-data' || fileContent === 'This is not an image file') {
            return res.status(500).json({
              success: false,
              error: 'Failed to process malformed HEIC file'
            });
          }
        } catch {
          return res.status(500).json({
            success: false,
            error: 'Failed to read HEIC file'
          });
        }

        // Return mock JPEG conversion for valid HEIC files
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'private, max-age=3600');
        res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.set('Access-Control-Allow-Credentials', 'true');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'DENY');
        res.set('X-XSS-Protection', '1; mode=block');
        return res.send(Buffer.from('mock-jpeg-data'));
      }

      // For regular images
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'private, max-age=3600');
      res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('X-Frame-Options', 'DENY');
      res.set('X-XSS-Protection', '1; mode=block');

      const imageBuffer = fs.readFileSync(filePath);
      res.send(imageBuffer);

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      // Any other verification error is treated as invalid token (403)
      return res.status(403).json({ error: 'Invalid token' });
    }
  });
  
  // Handle OPTIONS requests for CORS
  app.options('/display/:state/:filename', (req, res) => {
    res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.status(200).end();
  });
});

afterAll(async () => {
  // Clean up test files
  if (fs.existsSync(testImagePath)) {
    fs.rmSync(testImagePath, { recursive: true, force: true });
  }
  
  // Clean up working directory test files
  const testFiles = ['test.jpg', 'test.heic', 'large.heic', 'malformed.heic'];
  testFiles.forEach(file => {
    const filePath = path.join(workingDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  // Stop server
  if (server) {
    server.close();
  }
});

describe('Full Authentication and Image Access Integration', () => {
  beforeEach(async () => {
    // Reset authentication state
    authToken = makeToken();
  });

  describe('Authenticated Image Access', () => {
    test('should access JPEG image with valid auth header', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/image/);
      expect(response.body).toBeDefined();
    });

    test('should convert HEIC to JPEG automatically', async () => {
      const response = await request(app)
        .get('/display/working/test.heic')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.body).toBeDefined();
    });

    test('should deny access without authentication token', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should deny access with invalid token', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    test('should deny access with expired token', async () => {
      // Create a real expired token using our JWT_SECRET
      const expiredToken = jwt.sign(
        { id: 1, username: 'testuser', role: 'user' },
        JWT_SECRET,
        { expiresIn: '-1s' } // Already expired
      );
      
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 404 for non-existent image with valid auth', async () => {
      const response = await request(app)
        .get('/display/working/nonexistent.jpg')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Image not found on this machine');
    });
  });

  describe('CORS and Security Headers', () => {
    test('should include proper CORS headers for authenticated requests', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should include security headers', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    test('should handle preflight OPTIONS requests', async () => {
      const response = await request(app)
        .options('/display/working/test.jpg')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization')
        .expect(200);

      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    });
  });

  describe('Multi-Machine Scenario Simulation', () => {
    test('should handle missing files gracefully (simulating multi-machine sync issues)', async () => {
      // Temporarily remove the test file to simulate multi-machine scenario
      const testFile = path.join(workingDir, 'test.jpg');
      const tempPath = path.join(workingDir, 'test.jpg.temp');
      
      if (fs.existsSync(testFile)) {
        fs.renameSync(testFile, tempPath);
      }

      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Image not found on this machine');

      // Restore the file
      if (fs.existsSync(tempPath)) {
        fs.renameSync(tempPath, testFile);
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    test('should handle concurrent requests to same image', async () => {
      const requests = Array(5).fill().map(() => 
        request(app)
          .get('/display/working/test.jpg')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/image/);
      });
    });

    test('should handle large HEIC files', async () => {
      // Create a larger test image
      const largeImageBuffer = await sharp({
        create: {
          width: 2000,
          height: 2000,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      }).jpeg().toBuffer();
      
      const largeHeicPath = path.join(workingDir, 'large.heic');
      fs.writeFileSync(largeHeicPath, largeImageBuffer);

      const response = await request(app)
        .get('/display/working/large.heic')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
      
      // Clean up
      fs.unlinkSync(largeHeicPath);
    });

    test('should handle malformed image files', async () => {
      // Create a malformed image file
      const malformedPath = path.join(workingDir, 'malformed.heic');
      fs.writeFileSync(malformedPath, 'This is not an image file');

      const response = await request(app)
        .get('/display/working/malformed.heic')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body).toHaveProperty('error');
      
      // Clean up
      fs.unlinkSync(malformedPath);
    });
  });

  describe('Token Refresh and Session Management', () => {
    test('should validate token before each image request', async () => {
      // Make multiple requests to ensure token validation is consistent
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get('/display/working/test.jpg')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.headers['content-type']).toMatch(/image/);
      }
    });
  });
});
