const request = require('supertest');
const express = require('express');
const createUploadsRouter = require('../routes/uploads');
const mockKnex = {};

jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: () => ({
      upload: jest.fn(() => ({ data: null, error: { statusCode: 503, message: 'Upstream error' } })),
      list: jest.fn(() => ({ data: [], error: null })),
      remove: jest.fn(() => ({ data: null, error: null })),
    })
  }
}));

// Mock validateSafePath to return the input path directly (avoids realpathSync issues in CI)
jest.mock('../utils/pathValidator', () => ({
  validateSafePath: jest.fn((p) => p)
}));

describe('Downstream error hygiene', () => {
  let app;
  beforeAll(() => {
    app = express();
    // Minimal auth shim so uploads route sees an authenticated user
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1, role: 'user' };
      next();
    }, createUploadsRouter({ db: mockKnex }));
  });

  it('should return 502/503 and no stack leak on upstream error', async () => {
    const jpegHead = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0,
      0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01
    ]);
    const smallBuffer = Buffer.concat([jpegHead, Buffer.alloc(1024 - jpegHead.length, 1)]);
    const res = await request(app)
      .post('/uploads/upload')
      .attach('photo', smallBuffer, 'test.jpg');
    expect([502, 503, 500]).toContain(res.status);
    expect(res.text).not.toMatch(/Error:/);
    expect(res.text).not.toMatch(/at /);
  });
});
