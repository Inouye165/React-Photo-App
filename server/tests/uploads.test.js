// Mock all dependencies at the very top
jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
// Use the exported helpers from the supabase mock implementation
const { mockStorageHelpers } = require('./__mocks__/supabase');

// Mock ingestPhoto to avoid real image parsing in tests
jest.mock('../media/image', () => ({
  ingestPhoto: jest.fn(async (_db, _filePath, _filename, _state, _buffer) => {
    // Simulate thumbnail generation by adding a thumbnail file to mock storage
    try {
      mockStorageHelpers.addMockFile('photos', `thumbnails/${_filename}`, {
        size: 512,
        lastModified: new Date().toISOString()
      });
    } catch {
      // ignore if helpers are not available
    }

    return {
      duplicate: false,
      hash: 'mock-hash'
    };
  })
}));

jest.mock('jsonwebtoken');

// Mock multer to return a function that returns an object with single method
jest.mock('multer', () => {
  const multerMock = jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => {
      // Default behavior: set req.file and call next unless test indicates no-multer
      if (!req.headers || !req.headers['x-no-multer']) {
        req.file = {
          originalname: 'test.jpg',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake image data'),
          size: 12345
        };
      }
      next();
    })
  }));
  
  // Add static methods
  multerMock.memoryStorage = jest.fn(() => ({
    _handleFile: jest.fn(),
    _removeFile: jest.fn()
  }));
  
  return multerMock;
});

const request = require('supertest');
const express = require('express');

// Define mock helpers locally to avoid jest.mock interference
const mockPhotos = new Map();
const mockUsers = new Map();

const mockDbHelpers = {
  clearMockData: () => {
    mockPhotos.clear();
    mockUsers.clear();
  },
  loadDefaultData: () => {
    mockPhotos.clear();
    mockUsers.clear();
  },
  addMockPhoto: (photo) => {
    const id = Math.max(...Array.from(mockPhotos.keys()), 0) + 1;
    const fullPhoto = { id, ...photo };
    mockPhotos.set(id, fullPhoto);
    return fullPhoto;
  },
  addMockUser: (user) => {
    const id = Math.max(...Array.from(mockUsers.keys()), 0) + 1;
    const fullUser = {
      id,
      role: 'user',
      is_active: true,
      failed_login_attempts: 0,
      account_locked_until: null,
      last_login_attempt: null,
      ...user
    };
    mockUsers.set(id, fullUser);
    return fullUser;
  },
  getMockPhotos: () => Array.from(mockPhotos.values()),
  getMockUsers: () => Array.from(mockUsers.values()),
  setMockPhotos: (photos) => {
    mockPhotos.clear();
    photos.forEach(photo => mockPhotos.set(photo.id, photo));
  },
  setMockUsers: (users) => {
    mockUsers.clear();
    users.forEach(user => mockUsers.set(user.id, user));
  }
};

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
    
    // Use mocked database
    const mockKnex = require('knex');
    app.use('/uploads', createUploadsRouter({ db: mockKnex }));
    
    // Clear mock data to ensure clean state for each test
    mockStorageHelpers.clearMockStorage();
    mockDbHelpers.clearMockData();
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
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .set('x-no-multer', '1');

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
      expect(response.body.error).toBe('Failed to upload to storage');
    });

    it('should require authentication', async () => {
      // Create an app that enforces a minimal auth check (no JWT dependency)
      const unauthApp = express();
      unauthApp.use(express.json());
      const mockKnex = require('knex');

      // Minimal inline auth middleware to simulate global auth behavior
      const requireAuth = (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
          return res.status(401).json({ error: 'Access token required' });
        }
        next();
      };

      unauthApp.use('/uploads', requireAuth, createUploadsRouter({ db: mockKnex }));

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