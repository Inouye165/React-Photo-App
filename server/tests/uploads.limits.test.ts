/**
 * Tests for upload limits (file size and MIME type validation).
 * Updated for streaming upload architecture.
 */
/* eslint-env jest */

// Mock Supabase
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());

// Mock the queue module
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  checkRedisAvailable: jest.fn().mockResolvedValue(false)
}));

const request = require('supertest');
const express = require('express');
const createUploadsRouter = require('../routes/uploads');

// Create a mock database
const createMockDb = () => {
  return jest.fn(() => ({
    where: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        first: jest.fn().mockResolvedValue(null)
      }),
      update: jest.fn().mockResolvedValue(1)
    }),
    insert: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([{ id: 1, filename: 'test.jpg', hash: 'hash', storage_path: 'working/test.jpg' }])
    })
  }));
};

describe('Upload limits', () => {
  let app;
  let mockDb;

  beforeAll(() => {
    mockDb = createMockDb();
    app = express();
    // Add auth middleware
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1, username: 'testuser' };
      next();
    });
    app.use('/uploads', createUploadsRouter({ db: mockDb }));
  });

  it('should reject oversized upload (>10MB) with 413', async () => {
    const jpegHead = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0,
      0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01
    ]);
    const bigSize = 10 * 1024 * 1024 + 1;
    const bigBuffer = Buffer.concat([jpegHead, Buffer.alloc(bigSize - jpegHead.length, 1)]);
    const res = await request(app)
      .post('/uploads/upload')
      .attach('photo', bigBuffer, 'big.jpg');
    expect(res.status).toBe(413);
  }, 30000); // Increase timeout for large buffer

  it('should reject disallowed type with 415', async () => {
    const smallBuffer = Buffer.alloc(1024, 1); // 1KB
    const res = await request(app)
      .post('/uploads/upload')
      .attach('photo', smallBuffer, 'bad.txt');
    expect(res.status).toBe(415);
    expect(res.body.error).toBe('Only image files are allowed');
  });
});
