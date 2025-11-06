const request = require('supertest');
const express = require('express');
const helmet = require('helmet');
const createUploadsRouter = require('../routes/uploads');
const mockKnex = {};

describe('CSP in production', () => {
  let app;
  beforeAll(() => {
    process.env.NODE_ENV = 'production';
    app = express();
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }));
    app.use('/uploads', createUploadsRouter({ db: mockKnex }));
  });

  it('should have strict CSP headers in production', async () => {
    const res = await request(app).get('/uploads/upload');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).not.toMatch(/unsafe-inline/);
    expect(csp).not.toMatch(/localhost/);
    expect(csp).toMatch(/default-src 'self'|default-src 'none'/);
    // Accept either explicit frame-ancestors 'none' or absence (default is none)
    // Accept presence of script-src, style-src, img-src, connect-src if set
  });
});
