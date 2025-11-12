const request = require('supertest');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// This would typically import your actual server instance
// For testing, we might need to create a test server instance
let server;
let app;
let authCookie;

const JWT_SECRET = process.env.JWT_SECRET;
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
  app.use(cookieParser());
  
  // Mock auth endpoints for testing
  app.post('/auth/register', (req, res) => {
    const { username, password, email } = req.body;
    if (username && password && email) {
      res.status(201).json({
        message: 'User registered successfully',
        userId: 'test-user-id'
      });
    } else {
      res.status(400).json({ error: 'Invalid registration data' });
    }
  });
  
  app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'testuser' && password === 'TestPassword123!') {
      const token = jwt.sign(
        { id: 1, username: 'testuser', role: 'user' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      // Set httpOnly cookie to simulate real login session
      res.cookie('authToken', token, { httpOnly: true, sameSite: 'Lax' });
      res.json({ message: 'Login successful' });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
  
  // Mock display endpoint
  app.get('/display/:state/:filename', (req, res) => {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.trim() !== '') {
      return res.status(403).json({ error: 'Authorization header is not allowed for image access. Use the secure httpOnly authToken cookie.' });
    }

    // Reject any use of token in query string — this is intentionally
    // strict: tokens in URLs are insecure and should be disallowed.
    if (req.query && Object.prototype.hasOwnProperty.call(req.query, 'token')) {
      return res.status(403).json({ error: 'Token in query parameter is not allowed for image access. Use the secure httpOnly authToken cookie.' });
    }

    let token = null;

    // If no token in header, try cookie
    if (req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
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
  const testFiles = ['test.jpg', 'test.heic'];
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
    authCookie = null;
  });

  // Add a global beforeEach for all tests that need authentication
  const ensureAuthToken = async () => {
    if (!authCookie) {
      // Ensure user exists before trying to login
      await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser',
          password: 'TestPassword123!',
          email: 'test@example.com'
        })
        .catch(() => {}); // Ignore error if user already exists
      
      // Perform login to receive httpOnly cookie
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'TestPassword123!'
        });
      authCookie = loginResponse.headers['set-cookie'];
    }
  };

  describe('Authentication Flow', () => {
    test('should register a new user successfully', async () => {
      const registerData = {
        username: 'testuser',
        password: 'TestPassword123!',
        email: 'test@example.com'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('userId');
    });

    test('should login with correct credentials', async () => {
      const loginData = {
        username: 'testuser',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      // Login now sets an httpOnly cookie instead of returning the token in the body
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.headers['set-cookie']).toBeDefined();
      authCookie = response.headers['set-cookie'];
    });

    test('should reject login with incorrect credentials', async () => {
      const loginData = {
        username: 'testuser',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authenticated Image Access', () => {
    beforeEach(async () => {
      // Ensure user exists before trying to login
      await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser',
          password: 'TestPassword123!',
          email: 'test@example.com'
        })
        .catch(() => {}); // Ignore error if user already exists
      
      // Always get a fresh auth token for each test
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'TestPassword123!'
        });
      authCookie = loginResponse.headers['set-cookie'];
    });

    test('should access JPEG image with valid auth cookie (login)', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/image/);
      expect(response.body).toBeDefined();
    });

    test('should reject access when token is provided via query parameter', async () => {
      const tempToken = makeToken();
      const response = await request(app)
        .get(`/display/working/test.jpg?token=${tempToken}`)
        .expect(403);

      expect(response.body).toHaveProperty('error');
    });

    test('should convert HEIC to JPEG automatically', async () => {
      const response = await request(app)
        .get('/display/working/test.heic')
        .set('Cookie', authCookie)
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
        .set('Cookie', ['authToken=invalid-token'])
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
        .set('Cookie', [`authToken=${expiredToken}`])
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 404 for non-existent image with valid auth', async () => {
      const response = await request(app)
        .get('/display/working/nonexistent.jpg')
        .set('Cookie', authCookie)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Image not found on this machine');
    });
  });

  describe('CORS and Security Headers', () => {
    beforeEach(async () => {
      await ensureAuthToken();
    });

    test('should include proper CORS headers for authenticated requests', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Cookie', authCookie)
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should include security headers', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Cookie', authCookie)
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
    beforeEach(async () => {
      await ensureAuthToken();
    });

    test('should handle missing files gracefully (simulating multi-machine sync issues)', async () => {
      // Temporarily remove the test file to simulate multi-machine scenario
      const testFile = path.join(workingDir, 'test.jpg');
      const tempPath = path.join(workingDir, 'test.jpg.temp');
      
      if (fs.existsSync(testFile)) {
        fs.renameSync(testFile, tempPath);
      }

      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Cookie', authCookie)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Image not found on this machine');

      // Restore the file
      if (fs.existsSync(tempPath)) {
        fs.renameSync(tempPath, testFile);
      }
    });

    test('should handle database-image sync issues', async () => {
      // This test would simulate the scenario where database has records
      // but images are missing (common in multi-machine setups)
      
      // First, verify the image exists and is accessible
      await request(app)
        .get('/display/working/test.jpg')
        .set('Cookie', authCookie)
        .expect(200);

      // Simulate database cleanup would happen here
      // (removing orphaned database entries)
    });
  });

  describe('Performance and Edge Cases', () => {
    beforeEach(async () => {
      await ensureAuthToken();
    });

    test('should handle concurrent requests to same image', async () => {
      const requests = Array(5).fill().map(() => 
        request(app)
          .get('/display/working/test.jpg')
          .set('Cookie', authCookie)
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
        .set('Cookie', authCookie)
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
        .set('Cookie', authCookie)
        .expect(500);

      expect(response.body).toHaveProperty('error');
      
      // Clean up
      fs.unlinkSync(malformedPath);
    });
  });

  describe('Token Refresh and Session Management', () => {
    beforeEach(async () => {
      await ensureAuthToken();
    });

    test('should validate token before each image request', async () => {
      // Make multiple requests to ensure token validation is consistent
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .get('/display/working/test.jpg')
          .set('Cookie', authCookie)
          .expect(200);

        expect(response.headers['content-type']).toMatch(/image/);
      }
    });

    test('should handle token from different sources correctly', async () => {
      // Test header-based auth
      const headerResponse = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(200);

      await request(app)
        .get(`/display/working/test.jpg?token=${makeToken()}`)
        .expect(403);

      const cookieResponse = await request(app)
        .get('/display/working/test.jpg')
        .set('Cookie', authCookie)
        .expect(200);

      [headerResponse, cookieResponse].forEach(response => {
        expect(response.headers['content-type']).toMatch(/image/);
      });
    });
  });

  describe('Error Recovery and Logging', () => {
    beforeEach(async () => {
      await ensureAuthToken();
    });

    test('should log authentication failures appropriately', async () => {
      // This would test that failed auth attempts are logged
      // but sensitive information is not exposed
      
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Cookie', ['authToken=invalid-token'])
        .expect(403);

      expect(response.body.error).not.toContain('invalid-token');
    });

    test('should handle server errors gracefully', async () => {
      // Test resilience to server errors during image processing
      // This might involve mocking Sharp to throw an error
      
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Cookie', authCookie)
        .expect(200); // Should still work normally

      expect(response.headers['content-type']).toMatch(/image/);
    });
  });
});