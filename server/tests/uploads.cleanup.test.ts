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
      // Require modules inside the factory to avoid hoist-order issues.
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

  const minimalJpegBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x00, 0xFF, 0xD9
  ]);

  const createFailingDb = () => {
    return jest.fn((_tableName) => ({
      where: jest.fn(() => ({
        select: jest.fn(() => ({
          first: jest.fn().mockResolvedValue(null)
        })),
        first: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(1)
      })),
      insert: jest.fn(() => ({
        returning: jest.fn().mockImplementation(async () => {
          throw new Error('DB connection failed');
        })
      }))
    }));
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1 };
      next();
    });

    const db = createFailingDb();
    app.use('/uploads', createUploadsRouter({ db }));
  });

  it('removes orphaned file from storage if DB insert fails', async () => {
    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', minimalJpegBuffer, 'test.jpg');

    expect(response.status).toBe(500);
    
    // Verify file was removed from Supabase Storage
    const mockStorageHelpers = require('./__mocks__/supabase').mockStorageHelpers;
    const files = mockStorageHelpers.getMockFiles();
    const uploadedFile = files.find(([key]) => key.includes('working/') && key.includes('test.jpg'));
    expect(uploadedFile).toBeUndefined(); // File should be cleaned up
  });
});