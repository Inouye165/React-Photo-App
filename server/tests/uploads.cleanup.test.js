const request = require('supertest');
const express = require('express');
const path = require('path');
const os = require('os');

// 1. Define the mock function outside
const unlinkMock = jest.fn((path, cb) => cb && cb(null));

// 2. Mock 'fs' entirely. Use requireActual for non-mocked methods.
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn((p) => {
        // Return true for our temp file, false for others if needed
        if (typeof p === 'string' && p.includes('test-cleanup-upload')) return true;
        return originalFs.existsSync(p);
    }),
    writeFileSync: originalFs.writeFileSync, // Keep real write so we can create fixtures
    unlink: unlinkMock, // Inject our spy
  };
});

// Mock dependencies
jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
jest.mock('jsonwebtoken');

// Mock ingestPhoto to force a DB error
jest.mock('../media/image', () => ({
  // Prefix unused param with underscore to satisfy no-unused-vars argsIgnorePattern
  ingestPhoto: jest.fn(async (_db, _filePath) => {
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
      // We don't need to physically create the file because we mocked fs.existsSync to return true
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
    // Force DB Insert to Fail -> This triggers the cleanup catch block
    mockKnex.mockImplementation(() => ({
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(new Error('DB error')),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null)
    }));

    app.use('/uploads', createUploadsRouter({ db: mockKnex }));
    
    // Clear the spy before test
    unlinkMock.mockClear();
  });

  it('removes orphaned file from storage if DB insert fails', async () => {
    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', Buffer.from('fake'), 'test.jpg'); // Content doesn't matter, multer mock handles it

    expect(response.status).toBe(500);
    
    // The router should call fs.unlink when the DB insert fails
    expect(unlinkMock).toHaveBeenCalled();
  });
});