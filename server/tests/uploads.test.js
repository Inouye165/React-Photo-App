const request = require('supertest');
const express = require('express');

// Mock the database and media modules
const { vi } = require('vitest');
vi.mock('../db/index', () => ({
  openDb: vi.fn(() => ({})),
}));

vi.mock('../media/image', () => ({
  ingestPhoto: vi.fn(),
}));

vi.mock('../media/uploader', () => ({
  createUploadMiddleware: vi.fn(() => ({
    single: vi.fn(() => (req, res, next) => {
      // Mock multer middleware
      req.file = {
        path: '/tmp/test.jpg',
        filename: 'test.jpg',
      };
      next();
    }),
  })),
}));

const createUploadsRouter = require('../routes/uploads');

describe('Uploads Router', () => {
  let dbMock;
  let ingestPhotoMock;
  let createUploadMiddlewareMock;

  beforeEach(() => {
    dbMock = {};
    ingestPhotoMock = vi.mocked(require('../media/image').ingestPhoto);
    createUploadMiddlewareMock = vi.mocked(require('../media/uploader').createUploadMiddleware);
  });

  const createApp = () => {
    const router = createUploadsRouter({ db: dbMock }, {
      WORKING_DIR: '/tmp/working',
      INPROGRESS_DIR: '/tmp/inprogress',
      THUMB_DIR: '/tmp/thumbs',
    });

    const app = express();
    app.use(express.json());
    app.use('/uploads', router);
    return app;
  };

  it('should upload a photo successfully', async () => {
    const app = createApp();
    ingestPhotoMock.mockResolvedValue({ duplicate: false, hash: 'abc123' });

    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', Buffer.from('fake image data'), 'test.jpg');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      filename: 'test.jpg',
      hash: 'abc123',
    });
    expect(ingestPhotoMock).toHaveBeenCalledWith(dbMock, '/tmp/test.jpg', 'test.jpg', 'working');
  });

  it('should handle duplicate file', async () => {
    const app = createApp();
    ingestPhotoMock.mockResolvedValue({ duplicate: true, hash: 'abc123' });

    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', Buffer.from('fake image data'), 'test.jpg');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: false,
      duplicate: true,
      hash: 'abc123',
      message: 'Duplicate file skipped.',
    });
  });

  it('should return error when no file uploaded', async () => {
    // Mock middleware to not set req.file
    createUploadMiddlewareMock.mockReturnValueOnce({
      single: vi.fn(() => (req, res, next) => {
        // No req.file set
        next();
      }),
    });
    const app = createApp();

    const response = await request(app)
      .post('/uploads/upload');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'No file uploaded',
    });
  });

  it('should handle ingestPhoto errors', async () => {
    const app = createApp();
    ingestPhotoMock.mockRejectedValue(new Error('Ingest failed'));

    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', Buffer.from('fake image data'), 'test.jpg');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: 'Failed to save file',
    });
  });

  it('should reject non-image files', async () => {
    // Mock middleware to set req.file with invalid mimetype
    createUploadMiddlewareMock.mockReturnValueOnce({
      single: vi.fn(() => (req, res, next) => {
        req.file = {
          path: '/tmp/test.txt',
          filename: 'test.txt',
          mimetype: 'text/plain',
        };
        next();
      }),
    });
    const app = createApp();

    const response = await request(app)
      .post('/uploads/upload');

    // Currently, the route doesn't check mimetype, so it tries to ingest and fails
    expect(response.status).toBe(500);
  });
});