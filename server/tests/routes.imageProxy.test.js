/* eslint-env jest */

const request = require('supertest');
const express = require('express');

function createTestApp() {
  const app = express();
  app.set('trust proxy', 1);

  const { authenticateToken } = require('../middleware/auth');
  const createImageProxyRouter = require('../routes/imageProxy');

  app.use('/api/image-proxy', authenticateToken, createImageProxyRouter());

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  return app;
}

describe('Image Proxy Route', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.IMAGE_PROXY_ALLOWED_HOSTS = 'example.com';
    global.fetch = jest.fn();

    jest.resetModules();
    jest.doMock('dns', () => ({
      promises: {
        lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
      },
    }));
  });

  afterEach(() => {
    delete process.env.IMAGE_PROXY_ALLOWED_HOSTS;
    jest.resetAllMocks();
    jest.dontMock('dns');
  });

  it('forwards Range and returns key upstream headers', async () => {
    const body = Buffer.from('abc');

    // Node 20 provides Response/Headers globally in testEnvironment=node.
    const upstream = new Response(body, {
      status: 206,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(body.length),
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes 0-2/3',
        ETag: '"abc"',
        'Cache-Control': 'public, max-age=60',
      },
    });

    global.fetch.mockResolvedValue(upstream);

    const app = createTestApp();

    const res = await request(app)
      .get('/api/image-proxy')
      .query({ url: 'https://example.com/image.jpg' })
      .set('Authorization', 'Bearer test-token')
      .set('Range', 'bytes=0-2')
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/image.jpg',
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: expect.objectContaining({
          range: 'bytes=0-2',
          'accept-encoding': 'identity',
        }),
      })
    );

    expect(res.status).toBe(206);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-range']).toBe('bytes 0-2/3');
    expect(res.headers.etag).toBe('"abc"');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.toString('utf8')).toBe('abc');
  });

  it('blocks when allowlist is not configured', async () => {
    delete process.env.IMAGE_PROXY_ALLOWED_HOSTS;

    const app = createTestApp();

    const res = await request(app)
      .get('/api/image-proxy')
      .query({ url: 'https://example.com/image.jpg' })
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(403);
    expect(res.body && res.body.success).toBe(false);
  });
});
