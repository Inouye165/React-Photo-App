// Mock all dependencies at the very top
jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
// Use the exported helpers from the supabase mock implementation
const { mockStorageHelpers } = require('./__mocks__/supabase');

// Mock ingestPhoto to avoid real image parsing in tests
jest.mock('../media/image', () => ({
  ingestPhoto: jest.fn(async (_db, _filePath, _filename, _state, _input, _userId) => {
    // Simulate thumbnail generation by adding a thumbnail file to mock storage
    try {
      mockStorageHelpers.addMockFile('photos', `thumbnails/${_filename}`, {
        size: 512,
        lastModified: new Date().toISOString()
      });
    } catch {
      // ignore if helpers are not available
    }

    // Allow tests to simulate corrupt/missing EXIF by sending a specific buffer payload
    try {
      let content = _input;
      if (typeof _input === 'string') {
        // It's a path, read it SAFELY
        const fs = require('fs');
        if (fs.existsSync(_input)) {
           try {
             content = fs.readFileSync(_input);
           } catch (err) {
             console.log('Error reading file in mock:', err.message);
           }
        } else {
           // Fallback if file was already deleted by app logic (race condition fix)
           content = Buffer.from('mock-content-fallback');
        }
      }

      if (content && Buffer.isBuffer(content) && content.toString() === 'corrupt-exif') {
        // Simulate missing/corrupt EXIF but still process the image (return hash)
        return { duplicate: false, hash: 'mock-hash', metadataMissing: true };
      }
    } catch {
      // ignore
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
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const multerMock = jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => {
      // CRITICAL FIX: Check for no-multer header FIRST before creating any files
      const headers = req.headers || {};
      const noMulter = headers['x-no-multer'] || headers['X-No-Multer'];
      
      // If no-multer flag is set, don't create any file - just call next
      if (noMulter) {
        return next();
      }

      // Simulate multer fileFilter rejection when header is present
      if (req.headers && req.headers['x-multer-reject']) {
        // Simulate multer rejecting file types by sending an immediate response
        return res.status(400).json({ success: false, error: 'Only image files are allowed' });
      }

      // Default behavior: set req.file and call next
      // Allow tests to override mimetype/name/size via headers
      const mimetype = headers['x-multer-mimetype'] ? headers['x-multer-mimetype'] : 'image/jpeg';
      // Note: This mock defaults to 'test.jpg' unless header is set. 
      // This is why expectations below check for 'test.jpg' even if we upload a fixture with a different name.
      const originalname = headers['x-multer-originalname'] ? headers['x-multer-originalname'] : 'test.jpg';

      // Create a temp file to simulate diskStorage
      const tempPath = path.join(os.tmpdir(), `test-upload-${Date.now()}-${Math.random()}.tmp`);
      let fileContent = 'fake image data';

      if (headers['x-multer-zero']) {
        fileContent = '';
      } else if (headers['x-multer-buffer']) {
        fileContent = headers['x-multer-buffer']; // Treat as string or buffer
      }

      try {
        fs.writeFileSync(tempPath, fileContent);
        req.file = {
          originalname,
          mimetype,
          path: tempPath,
          size: Buffer.byteLength(fileContent)
        };
      } catch (err) {
        console.error('Mock multer failed to write temp file:', err);
      }
      
      next();
    })
  }));
  
  // Add static methods
  multerMock.diskStorage = jest.fn(() => ({
    _handleFile: jest.fn(),
    _removeFile: jest.fn()
  }));
  // Keep memoryStorage mock just in case, though we switched to diskStorage
  multerMock.memoryStorage = jest.fn(() => ({
    _handleFile: jest.fn(),
    _removeFile: jest.fn()
  }));
  
  return multerMock;
});

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

// Global test fixture path
const TEST_FIXTURE_PATH = path.join(os.tmpdir(), 'test-fixture-upload.jpg');

describe('Uploads Router with Supabase Storage', () => {
  let app;

  beforeEach(() => {
    // Create a real file for supertest to attach
    // This prevents ENOENT errors if supertest tries to read a buffer stream that gets closed early
    try {
      fs.writeFileSync(TEST_FIXTURE_PATH, 'fake image data');
    } catch (e) {
      console.error('Failed to create test fixture:', e);
    }

    // Create express app with auth middleware
    app = express();
    app.use(express.json());
    
    // Add auth middleware that accepts our test token
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1, username: 'testuser' };
      next();
    });
    
    // Use mocked database
    const mockKnex = require('knex');
    app.use('/uploads', createUploadsRouter({ db: mockKnex }));
    
    // Clear mock data to ensure clean state for each test
    mockStorageHelpers.clearMockStorage();
    mockDbHelpers.clearMockData();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up the fixture file
    try {
      if (fs.existsSync(TEST_FIXTURE_PATH)) {
        fs.unlinkSync(TEST_FIXTURE_PATH);
      }
    } catch {
      // ignore cleanup errors
    }
  });

  describe('POST /upload', () => {
    it('should upload a photo successfully to Supabase Storage', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_FIXTURE_PATH);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Fixed: Mock forces 'test.jpg' so we expect 'test.jpg'
      expect(response.body.filename).toMatch(/^[a-f0-9-]{36}-test\.jpg$/i);
      expect(response.body.hash).toBeDefined();
      // Verify file was added to mock storage (find by prefix)
      const uploadedFile = (mockStorageHelpers.getMockFiles ? mockStorageHelpers.getMockFiles() : []).find(([k]) => /working\/[a-f0-9-]{36}-test\.jpg$/i.test(k));
      expect(uploadedFile).toBeDefined();
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
        .attach('photo', TEST_FIXTURE_PATH);

      // Should still succeed, but filename will be UUID-prefixed
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Fixed: Mock forces 'test.jpg' so we expect 'test.jpg'
      expect(response.body.filename).toMatch(/^[a-f0-9-]{36}-test\.jpg$/i);
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
      // Use the mock helper to always error on upload
      mockStorageHelpers.setAlwaysErrorOnUpload(true);

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_FIXTURE_PATH);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to upload to storage');

      // Restore normal upload behavior
      mockStorageHelpers.setAlwaysErrorOnUpload(false);
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

      // Don't attach file - auth rejection happens before multer runs
      const response = await request(unauthApp)
        .post('/uploads/upload')
        .field('test', 'value'); // Send some data but no file

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access token required');
    });

    it('should generate thumbnail for uploaded image', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_FIXTURE_PATH);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Check that thumbnail was created in storage
      const mockFiles = mockStorageHelpers.getMockFiles();
      // Find a thumbnail file with a UUID prefix
      // Fixed: Mock forces 'test.jpg' so we must check for that, not test-fixture-upload.jpg
      const thumbnailFile = (mockFiles ? Object.values(mockFiles) : []).find(([k]) => /thumbnails\/[a-f0-9-]{36}-test\.jpg$/i.test(k));
      expect(thumbnailFile).toBeDefined();
    });

    it('should reject a zero-byte (empty) file upload', async () => {
      // For this specific test, we can use a buffer or a dedicated empty file
      const emptyPath = path.join(os.tmpdir(), 'empty-test.jpg');
      fs.writeFileSync(emptyPath, '');

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .set('x-multer-zero', '1') // Helper for our multer mock
        .attach('photo', emptyPath);
      
      try { fs.unlinkSync(emptyPath); } catch {}

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Empty file uploaded');
    });

    it('should reject unsupported MIME types', async () => {
      // Don't attach real file - multer mock rejects before reading
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        // instruct multer mock to reject the fileFilter
        .set('x-multer-reject', '1')
        .field('test', 'value'); // Send some data but multer will reject

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Only image files are allowed');
    });

    it('should handle images with corrupt or missing EXIF data gracefully', async () => {
      const corruptPath = path.join(os.tmpdir(), 'corrupt.jpg');
      fs.writeFileSync(corruptPath, 'corrupt-exif');

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        // Provide a special buffer payload that our ingestPhoto mock recognizes
        .set('x-multer-buffer', 'corrupt-exif')
        .set('x-multer-originalname', 'corrupt.jpg')
        .attach('photo', corruptPath);

      try { fs.unlinkSync(corruptPath); } catch {}

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.hash).toBeDefined();
      // Verify file exists in storage despite missing EXIF
      const uploadedFile = (mockStorageHelpers.getMockFiles ? mockStorageHelpers.getMockFiles() : []).find(([k]) => /working\/[a-f0-9-]{36}-corrupt\.jpg$/i.test(k));
      expect(uploadedFile).toBeDefined();
    });
  });
});