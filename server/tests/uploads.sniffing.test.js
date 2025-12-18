/**
 * Upload signature sniffing tests.
 *
 * Verifies server rejects spoofed content-types by validating magic bytes
 * before uploading to storage.
 */
/* eslint-env jest */

jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());

// Mock queue functions to avoid Redis
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  checkRedisAvailable: jest.fn().mockResolvedValue(false)
}));

const request = require('supertest');
const express = require('express');

const createUploadsRouter = require('../routes/uploads');

const minimalJpegBuffer = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10,
  0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0xFF, 0xD9
]);

const createMockDb = () => {
  let nextId = 1;

  return jest.fn((_tableName) => ({
    where: jest.fn(() => ({
      select: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null)
      })),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(1)
    })),
    insert: jest.fn((data) => ({
      returning: jest.fn().mockResolvedValue([{
        id: nextId++,
        filename: data.filename,
        hash: data.hash,
        storage_path: data.storage_path
      }])
    })),
    select: jest.fn(() => ({
      first: jest.fn().mockResolvedValue(null)
    }))
  }));
};

describe('Uploads - Signature sniffing', () => {
  let app;

  beforeEach(() => {
    const db = createMockDb();

    app = express();
    app.use(express.json());

    // Auth middleware
    app.use('/uploads', (req, _res, next) => {
      req.user = { id: 1, email: 'test@example.com' };
      next();
    });

    app.use('/uploads', createUploadsRouter({ db }));
  });

  it('rejects spoofed JPEG content-type when bytes are not an image', async () => {
    const res = await request(app)
      .post('/uploads/upload')
      .attach('photo', Buffer.from('not an image'), {
        filename: 'good.jpg',
        contentType: 'image/jpeg'
      });

    expect(res.status).toBe(415);
    expect(res.body).toBeTruthy();
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_FILE_SIGNATURE');
  });

  it('accepts valid JPEG bytes (mocked storage)', async () => {
    const res = await request(app)
      .post('/uploads/upload')
      .attach('photo', minimalJpegBuffer, {
        filename: 'good.jpg',
        contentType: 'image/jpeg'
      });

    expect([200, 202]).toContain(res.status);
    expect(res.body).toBeTruthy();
    expect(res.body.success).toBe(true);
    expect(res.body.path).toMatch(/^working\//);
  });
});
