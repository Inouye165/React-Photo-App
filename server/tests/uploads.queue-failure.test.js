// Mock dependencies at top
jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());

// Mock queue functions (queue available but enqueue fails)
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
  checkRedisAvailable: jest.fn().mockResolvedValue(true),
}));

// Mock background processor to keep tests fast
jest.mock('../media/backgroundProcessor', () => ({
  processUploadedPhoto: jest.fn().mockResolvedValue({ photoId: 123 }),
}));

const request = require('supertest');
const express = require('express');

const createUploadsRouter = require('../routes/uploads');

const createMockDb = () => {
  let nextId = 123;
  const mockKnex = jest.fn((_tableName) => ({
    where: jest.fn(() => ({
      select: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null),
      })),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(1),
    })),
    insert: jest.fn((data) => ({
      returning: jest.fn().mockResolvedValue([
        {
          id: nextId++,
          filename: data.filename,
          hash: data.hash,
          storage_path: data.storage_path,
        },
      ]),
    })),
    select: jest.fn(() => ({
      first: jest.fn().mockResolvedValue(null),
    })),
  }));

  return mockKnex;
};

describe('Upload: background queue failure handling', () => {
  let app;
  let mockDb;
  let originalFallback;

  beforeEach(() => {
    originalFallback = process.env.UPLOAD_FALLBACK_PROCESSING;
    process.env.UPLOAD_FALLBACK_PROCESSING = 'true';

    mockDb = createMockDb();
    app = express();
    app.use(express.json());
    app.use('/uploads', (req, res, next) => {
      req.user = { id: 1, username: 'testuser' };
      next();
    });
    app.use('/uploads', createUploadsRouter({ db: mockDb }));
  });

  afterEach(() => {
    if (originalFallback === undefined) {
      delete process.env.UPLOAD_FALLBACK_PROCESSING;
    } else {
      process.env.UPLOAD_FALLBACK_PROCESSING = originalFallback;
    }
    jest.clearAllMocks();
  });

  it('uploads successfully and falls back to immediate processing', async () => {
    const jpegHead = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0,
      0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01,
    ]);
    const smallBuffer = Buffer.concat([jpegHead, Buffer.alloc(1024 - jpegHead.length, 1)]);

    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', smallBuffer, 'test.jpg');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.processing).toBe('immediate');

    const backgroundProcessor = require('../media/backgroundProcessor');
    expect(backgroundProcessor.processUploadedPhoto).toHaveBeenCalledTimes(1);
  });
});
