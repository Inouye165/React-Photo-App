const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock dependencies
jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
jest.mock('jsonwebtoken');

// Mock ingestPhoto to force a DB error
jest.mock('../media/image', () => ({
  ingestPhoto: jest.fn(async (_db, filePath) => {
    // FIX: require fs inside the mock to avoid ReferenceError
    const fsInside = require('fs');
    
    // Read the file to ensure we trigger the ENOENT if it's missing (simulating real work)
    if (typeof filePath === 'string') {
        if (!fsInside.existsSync(filePath)) {
            throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
        }
    }
    
    // Simulate a successful processing that returns a hash
    return {
      duplicate: false,
      hash: 'mock-hash-cleanup'
    };
  })
}));

// Mock multer
jest.mock('multer', () => {
  const multerMock = jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => {
      // Create a predictable temp file
      const osInside = require('os');
      const fsInside = require('fs');
      const pathInside = require('path');
      
      const tempPath = pathInside.join(osInside.tmpdir(), 'test-cleanup-upload.tmp');
      try {
        fsInside.writeFileSync(tempPath, 'temp content');
      } catch {
        // unused error ignored
      }

      req.file = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        path: tempPath,
        size: 1234
      };
      next();
    })
  }));
  multerMock.diskStorage = jest.fn(() => ({}));
  multerMock.memoryStorage = jest.fn(() => ({}));
  return multerMock;
});

const createUploadsRouter = require('../routes/uploads');

describe('Upload Route - Orphaned File Cleanup', () => {
  let app;
  let mockKnex;
  const TEMP_FILE_PATH = path.join(os.tmpdir(), 'test-cleanup-upload.tmp');

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Auth middleware
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1 };
      next();
    });

    mockKnex = require('knex');
    // Force DB Insert to Fail
    mockKnex.mockImplementation(() => ({
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(new Error('DB error')),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null)
    }));

    app.use('/uploads', createUploadsRouter({ db: mockKnex }));

    // Ensure fixture exists
    try {
        fs.writeFileSync(TEMP_FILE_PATH, 'temp content');
    } catch {}
  });

  afterEach(() => {
    jest.clearAllMocks();
    try {
      if (fs.existsSync(TEMP_FILE_PATH)) fs.unlinkSync(TEMP_FILE_PATH);
    } catch {}
  });

  it('removes orphaned file from storage if DB insert fails', async () => {
    // Setup: The router calls ingestPhoto (success), then tries DB insert (fails)
    // We expect the catch block to trigger cleanup
    
    // We spy on fs.unlink to verify cleanup attempted
    const unlinkSpy = jest.spyOn(fs, 'unlink');

    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', TEMP_FILE_PATH);

    expect(response.status).toBe(500);
    
    // Verify it attempted to unlink the file
    // Note: The actual file might be gone if the code worked, or handled by the mock
    expect(unlinkSpy).toHaveBeenCalled();
  });
});