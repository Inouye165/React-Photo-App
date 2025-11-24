const request = require('supertest');
const express = require('express');
const path = require('path');
const os = require('os');

// 1. FIX: Variable MUST start with 'mock' to be used inside jest.mock factory
const mockUnlink = jest.fn((path, cb) => cb && cb(null));

// 2. Mock 'fs' entirely.
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn((p) => {
        // Return true for our temp file logic
        if (typeof p === 'string' && p.includes('test-cleanup-upload')) return true;
        return originalFs.existsSync(p);
    }),
    writeFileSync: originalFs.writeFileSync, 
    unlink: mockUnlink, // Now safe to access because it starts with 'mock'
  };
});

// Mock dependencies
jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
jest.mock('jsonwebtoken');

// Mock ingestPhoto
jest.mock('../media/image', () => ({
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
    
    mockUnlink.mockClear();
  });

  it('removes orphaned file from storage if DB insert fails', async () => {
    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', Buffer.from('fake'), 'test.jpg');

    expect(response.status).toBe(500);
    expect(mockUnlink).toHaveBeenCalled();
  });
});