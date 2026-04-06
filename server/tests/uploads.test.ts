/**
 * Integration tests for the streaming upload router.
 * 
 * These tests verify the upload endpoint works correctly with the
 * streaming architecture (busboy + direct Supabase upload).
 */
/* eslint-env jest */

// Mock Supabase before any modules are imported
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
const { mockStorageHelpers } = require('./__mocks__/supabase');

// Mock the queue module to prevent Redis connection attempts
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  checkRedisAvailable: jest.fn().mockResolvedValue(false) // Simulate no Redis
}));

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const createUploadsRouter = require('../routes/uploads');

// Global test fixture path
const TEST_FIXTURE_PATH = path.join(os.tmpdir(), 'test-fixture-upload.jpg');

const minimalJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0,
  0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01,
  0xff, 0xd9
]);

// Create a mock database that supports the operations used by the streaming router
const createMockDb = () => {
  const photos = new Map();
  let nextId = 1;

  const mockKnex = jest.fn((tableName) => {
    if (tableName === 'photos') {
      return {
        where: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            first: jest.fn().mockImplementation(() => {
              // Return null (no duplicate) by default
              return Promise.resolve(null);
            })
          }),
          update: jest.fn().mockResolvedValue(1)
        }),
        insert: jest.fn().mockReturnValue({
          returning: jest.fn().mockImplementation((_fields) => {
            const id = nextId++;
            const record = { id, filename: `test-${id}.jpg`, hash: 'mock-hash', storage_path: 'working/test.jpg' };
            photos.set(id, record);
            return Promise.resolve([record]);
          })
        }),
        select: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null)
        })
      };
    }
    return {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([{ id: 1 }])
    };
  });

  // Add helper to check for duplicates
  mockKnex.setDuplicateHash = (hash) => {
    mockKnex._duplicateHash = hash;
  };

  return mockKnex;
};

describe('Uploads Router with Streaming Architecture', () => {
  let app;
  let mockDb;

  beforeEach(() => {
    // Create a real file for supertest to attach
    try {
      fs.writeFileSync(TEST_FIXTURE_PATH, minimalJpegBuffer);
    } catch (e) {
      console.error('Failed to create test fixture:', e);
    }

    mockDb = createMockDb();

    // Create express app with auth middleware
    app = express();
    
    // Add auth middleware that sets req.user
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1, username: 'testuser' };
      next();
    });
    
    app.use('/uploads', createUploadsRouter({ db: mockDb }));
    
    // Clear mock storage
    mockStorageHelpers.clearMockStorage();
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
      expect(response.body.filename).toMatch(/^[a-f0-9-]{36}-test-fixture-upload\.jpg$/i);
      expect(response.body.hash).toBeDefined();
      expect(response.body.path).toMatch(/^original\/\d+\//);
    });

    it('should return error when no file uploaded', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No file uploaded');
    });

    it('should handle Supabase Storage errors', async () => {
      mockStorageHelpers.setAlwaysErrorOnUpload(true);

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_FIXTURE_PATH);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to upload to storage');

      mockStorageHelpers.setAlwaysErrorOnUpload(false);
    });

    it('should require authentication', async () => {
      // Create an app without auth middleware
      const unauthApp = express();
      unauthApp.use('/uploads', createUploadsRouter({ db: mockDb }));

      // Use a simple JSON request instead of multipart to avoid stream issues
      const response = await request(unauthApp)
        .post('/uploads/upload')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should reject empty file uploads', async () => {
      const emptyPath = path.join(os.tmpdir(), 'empty-test.jpg');
      fs.writeFileSync(emptyPath, '');

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', emptyPath);

      try { fs.unlinkSync(emptyPath); } catch {}

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Empty file uploaded');
    });

    it('should reject non-image MIME types', async () => {
      const textPath = path.join(os.tmpdir(), 'test.txt');
      fs.writeFileSync(textPath, 'this is not an image');

      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', textPath);

      try { fs.unlinkSync(textPath); } catch {}

      expect(response.status).toBe(415);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Only image files are allowed');
    });

    it('should include photoId in response', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_FIXTURE_PATH);

      expect(response.status).toBe(200);
      expect(response.body.photoId).toBeDefined();
      expect(typeof response.body.photoId).toBe('number');
    });

    it('should include processing status in response', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_FIXTURE_PATH);

      expect(response.status).toBe(200);
      expect(response.body.processing).toBeDefined();
      // Since Redis is mocked as unavailable, should be 'immediate'
      expect(response.body.processing).toBe('immediate');
    });

    it('should calculate file hash during streaming', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_FIXTURE_PATH);

      expect(response.status).toBe(200);
      expect(response.body.hash).toBeDefined();
      // SHA256 hash should be 64 hex characters
      expect(response.body.hash).toMatch(/^[a-f0-9]{64}$/i);
    });

    it('should generate UUID-prefixed filenames', async () => {
      const response = await request(app)
        .post('/uploads/upload')
        .set('Authorization', 'Bearer valid-token')
        .attach('photo', TEST_FIXTURE_PATH);

      expect(response.status).toBe(200);
      // UUID is 36 chars (with dashes), followed by dash and original filename
      expect(response.body.filename).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-.+$/i);
    });
  });
});
