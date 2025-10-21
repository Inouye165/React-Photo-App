const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { authenticateImageRequest } = require('../middleware/imageAuth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

// Mock the media/image module
jest.mock('../media/image', () => ({
  convertHeicToJpegBuffer: jest.fn()
}));

const { convertHeicToJpegBuffer } = require('../media/image');

describe('Display Endpoint with HEIC Support', () => {
  let app;
  let validToken;
  const testImageDir = path.join(__dirname, 'test-images');

  beforeAll(() => {
    // Create test token
    validToken = jwt.sign(
      { id: 1, username: 'testuser', role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Setup test app with display endpoint
    app = express();
    app.use(cookieParser()); // Add cookie parser middleware
    
    // Mock display endpoint similar to server.js
    app.get('/display/:state/:filename', authenticateImageRequest, async (req, res) => {
      const { state, filename } = req.params;
      
      // Simple directory mapping for tests
      const dir = testImageDir;
      const filePath = path.join(dir, filename);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ 
          success: false, 
          error: 'Image not found on this machine',
          filename: filename,
          state: state
        });
      }
      
      // Set headers
      res.set({
        'Cache-Control': 'private, max-age=3600',
        'Access-Control-Allow-Origin': req.headers.origin || '*',
        'Access-Control-Allow-Credentials': 'true'
      });
      
      // Check for HEIC files
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.heic' || ext === '.heif') {
        try {
          const jpegBuffer = await convertHeicToJpegBuffer(filePath, 85);
          
          res.set({
            'Content-Type': 'image/jpeg',
            'Content-Length': jpegBuffer.length
          });
          
          res.send(jpegBuffer);
        } catch (convErr) {
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to convert HEIC file for display',
            filename: filename
          });
        }
      } else {
        res.sendFile(filePath);
      }
    });

    // Create test images directory and files
    if (!fs.existsSync(testImageDir)) {
      fs.mkdirSync(testImageDir, { recursive: true });
    }
    
    // Create test files
    fs.writeFileSync(path.join(testImageDir, 'test.jpg'), 'fake-jpeg-data');
    fs.writeFileSync(path.join(testImageDir, 'test.heic'), 'fake-heic-data');
  });

  afterAll(() => {
    // Cleanup test files
    try {
      fs.rmSync(testImageDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Required', () => {
    test('should require authentication for display endpoint', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required for image access');
    });

    test('should accept valid token for display endpoint', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${validToken}`);

      // Should not be 401/403
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  describe('File Existence Checks', () => {
    test('should return 404 for non-existent files', async () => {
      const response = await request(app)
        .get('/display/working/nonexistent.jpg')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Image not found on this machine');
      expect(response.body.filename).toBe('nonexistent.jpg');
      expect(response.body.state).toBe('working');
    });

    test('should serve existing regular image files', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      // Should set proper cache headers
      expect(response.headers['cache-control']).toBe('private, max-age=3600');
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('HEIC File Conversion', () => {
    test('should convert HEIC files to JPEG', async () => {
      const mockJpegBuffer = Buffer.from('converted-jpeg-data');
      convertHeicToJpegBuffer.mockResolvedValue(mockJpegBuffer);

      const response = await request(app)
        .get('/display/working/test.heic')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(convertHeicToJpegBuffer).toHaveBeenCalledWith(
        path.join(testImageDir, 'test.heic'),
        85
      );
      
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['content-length']).toBe(mockJpegBuffer.length.toString());
      expect(response.body).toEqual(mockJpegBuffer);
    });

    test('should handle HEIC conversion failures', async () => {
      convertHeicToJpegBuffer.mockRejectedValue(new Error('Conversion failed'));

      const response = await request(app)
        .get('/display/working/test.heic')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to convert HEIC file for display');
      expect(response.body.filename).toBe('test.heic');
    });

    test('should handle HEIF files same as HEIC', async () => {
      // Create a test HEIF file
      fs.writeFileSync(path.join(testImageDir, 'test.heif'), 'fake-heif-data');
      
      const mockJpegBuffer = Buffer.from('converted-jpeg-data');
      convertHeicToJpegBuffer.mockResolvedValue(mockJpegBuffer);

      const response = await request(app)
        .get('/display/working/test.heif')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(convertHeicToJpegBuffer).toHaveBeenCalledWith(
        path.join(testImageDir, 'test.heif'),
        85
      );
      
      expect(response.headers['content-type']).toBe('image/jpeg');
    });

    test('should not attempt conversion for non-HEIC files', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${validToken}`);

      expect(convertHeicToJpegBuffer).not.toHaveBeenCalled();
      // JPG files should still have image/jpeg content-type, just not from conversion
      expect(response.headers['content-type']).toBe('image/jpeg');
    });
  });

  describe('State Parameter Validation', () => {
    test('should accept valid state parameters', async () => {
      const states = ['working', 'inprogress', 'finished'];
      
      for (const state of states) {
        const response = await request(app)
          .get(`/display/${state}/test.jpg`)
          .set('Authorization', `Bearer ${validToken}`);
        
        // Should not return 400 for invalid state
        expect(response.status).not.toBe(400);
      }
    });
  });

  describe('Response Headers', () => {
    test('should set appropriate headers for image serving', async () => {
      const response = await request(app)
        .get('/display/working/test.jpg')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['cache-control']).toBe('private, max-age=3600');
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should set JPEG content-type for converted HEIC files', async () => {
      const mockJpegBuffer = Buffer.from('converted-jpeg-data');
      convertHeicToJpegBuffer.mockResolvedValue(mockJpegBuffer);

      const response = await request(app)
        .get('/display/working/test.heic')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['content-length']).toBe(mockJpegBuffer.length.toString());
    });
  });

  describe('Error Handling', () => {
    test('should handle conversion errors gracefully', async () => {
      convertHeicToJpegBuffer.mockRejectedValue(new Error('ImageMagick not found'));

      const response = await request(app)
        .get('/display/working/test.heic')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to convert HEIC file for display',
        filename: 'test.heic'
      });
    });

    test('should handle file system errors', async () => {
      // Test with a file that doesn't exist
      const response = await request(app)
        .get('/display/working/definitely-does-not-exist.jpg')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Image not found on this machine');
    });
  });
});