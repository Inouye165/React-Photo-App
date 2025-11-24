const request = require('supertest');
const express = require('express');

// Mock pathValidator to bypass validation for this test
jest.mock('../utils/pathValidator', () => ({
  validateSafePath: jest.fn((p) => p)
}));

// FIX: Define mocks entirely inside the factory to avoid hoisting ReferenceErrors
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    // Mock existsSync for specific test paths
    existsSync: jest.fn((p) => {
        if (typeof p === 'string' && p.includes('test-cleanup-upload')) return true;
        return originalFs.existsSync(p);
    }),
    writeFileSync: originalFs.writeFileSync, 
    // Define the spy directly here
    unlink: jest.fn((path, cb) => cb && cb(null)), 
  };
});

jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
jest.mock('jsonwebtoken');

jest.mock('../media/image', () => ({
  ingestPhoto: jest.fn(async (_db, _filePath) => {
    return {
      duplicate: false,
      hash: 'mock-hash-cleanup'
    };
  })
}));

jest.mock('multer', () => {
  const multerMock = jest.fn(() => ({
    single: jest.fn(() => (req, res, next) => {
      // Require modules inside to be safe
      const path = require('path');
      const os = require('os');
      const tempPath = path.join(os.tmpdir(), 'test-cleanup-upload.tmp');
      
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

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1 };
      next();
    });

    mockKnex = require('knex');
    mockKnex.mockImplementation(() => ({
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(new Error('DB error')),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null)
    }));

    app.use('/uploads', createUploadsRouter({ db: mockKnex }));
    
    // Get the mocked fs module to access the spy
    const fs = require('fs');
    fs.unlink.mockClear();
  });

  it('removes orphaned file from storage if DB insert fails', async () => {
    // Mock ingestPhoto to throw an error (simulating DB failure)
    const { ingestPhoto } = require('../media/image');
    ingestPhoto.mockRejectedValueOnce(new Error('DB connection failed'));

    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', Buffer.from('fake'), 'test.jpg');

    expect(response.status).toBe(500);
    
    // Verify file was removed from Supabase Storage
    const mockStorageHelpers = require('./__mocks__/supabase').mockStorageHelpers;
    const files = mockStorageHelpers.getMockFiles();
    const uploadedFile = files.find(([key]) => key.includes('working/') && key.includes('test.jpg'));
    expect(uploadedFile).toBeUndefined(); // File should be cleaned up
  });
});