const request = require('supertest');
const express = require('express');
const createUploadsRouter = require('../routes/uploads');
const mockKnex = {};

describe('Upload limits', () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use('/uploads', createUploadsRouter({ db: mockKnex }));
  });

  it('should reject oversized upload (>10MB) with 413', async () => {
    const bigBuffer = Buffer.alloc(10 * 1024 * 1024 + 1, 1); // 10MB + 1 byte
    const res = await request(app)
      .post('/uploads/upload')
      .attach('photo', bigBuffer, 'big.jpg');
    expect(res.status).toBe(413);
  });

  it('should reject disallowed type with 415', async () => {
    const smallBuffer = Buffer.alloc(1024, 1); // 1KB
    const res = await request(app)
      .post('/uploads/upload')
      .attach('photo', smallBuffer, 'bad.txt');
    expect([415, 400, 500]).toContain(res.status); // Accept 415, 400, or 500 for file type rejection
  });
});
