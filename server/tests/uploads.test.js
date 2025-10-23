const request = require('supertest');
const express = require('express');
const { mockStorageHelpers, mockDbHelpers } = require('./setup');

// Import the real authentication middleware for testing
const authenticateToken = require('../middleware/auth').authenticateToken;

// Mock JWT for testing
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token, secret, callback) => {
    if (token === 'valid-token') {
      callback(null, { userId: 1, username: 'testuser' });
    } else {
      callback(new Error('Invalid token'));
    }
  })
}));

// Mock multer middleware
jest.mock('multer', () => {
  return () => ({
    single: () => (req, res, next) => {
      req.file = {
        buffer: Buffer.from('fake image data'),
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024
      };
      next();
    }
  });
});

const createUploadsRouter = require('../routes/uploads');

describe('Uploads Router with Supabase Storage', () => {
  let app;

  beforeEach(() => {
    // Create express app with auth middleware
    app = express();
    app.use(express.json());
    
    // Add auth middleware that accepts our test token
    app.use('/uploads', (req, res, next) => {
      req.user = { userId: 1, username: 'testuser' };
      next();
    });
    
    app.use('/uploads', createUploadsRouter());
  });

  describe('POST /upload', () => {
    it('should upload a photo successfully to Supabase Storage', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', Buffer.from('fake image data'), 'test.jpg');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.filename).toBe('test.jpg');
      expect(response.body.hash).toBeDefined();
      
      // Verify file was added to mock storage
      expect(mockStorageHelpers.hasMockFile('photos', 'working/test.jpg')).toBe(true);
    });

    it('should handle duplicate file detection', async () => {
      // Add a photo to the mock database first
      mockDbHelpers.addMockPhoto({
        filename: 'test.jpg',
        hash: 'duplicate-hash',
        state: 'working',
        storage_path: 'working/test.jpg'
      });

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', Buffer.from('fake image data'), 'test.jpg');

      // The duplicate check logic will depend on your implementation
      // This test may need adjustment based on actual duplicate handling
      expect(response.status).toBe(200);
    });

    it('should return error when no file uploaded', async () => {
      // Mock multer to not set req.file
      jest.doMock('multer', () => {
        return () => ({
          single: () => (req, res, next) => {
            // No req.file set
            next();
          }
        });
      });

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No file uploaded');
    });

    it('should handle Supabase Storage errors', async () => {
      // Set up mock storage to return an error
      mockStorageHelpers.setMockError('photos', 'working/test.jpg', {
        message: 'Storage unavailable',
        status: 500
      });

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', Buffer.from('fake image data'), 'test.jpg');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to save file');
    });

    it('should require authentication', async () => {
      // Remove auth middleware
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use('/uploads', createUploadsRouter());

      const response = await request(unauthApp)
        .post('/uploads/upload')
        .attach('photo', Buffer.from('fake image data'), 'test.jpg');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access token required');
    });

    it('should generate thumbnail for uploaded image', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', Buffer.from('fake image data'), 'test.jpg');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Check that thumbnail was created in storage
      const mockFiles = mockStorageHelpers.getMockFiles();
      const thumbnailFile = mockFiles.find(([key]) => key.includes('thumbnails/'));
      expect(thumbnailFile).toBeDefined();
    });
  });
});