/**
 * Tests for Feedback API Route
 *
 * Public endpoint mounted at /api/feedback.
 * This test uses an isolated Express app (no csurf/auth) to validate route behavior.
 */

/* eslint-env jest */

const request = require('supertest');
const express = require('express');

const mockInsert = jest.fn();
const mockReturning = jest.fn();

const createMockDb = () => {
  const mockDb = jest.fn((_tableName) => ({
    insert: mockInsert.mockReturnValue({
      returning: mockReturning,
    }),
  }));

  mockDb.raw = jest.fn().mockResolvedValue(true);
  mockDb.fn = { now: jest.fn().mockReturnValue('NOW()') };
  mockDb.schema = {
    hasTable: jest.fn().mockResolvedValue(true),
    createTable: jest.fn().mockResolvedValue(true),
    dropTableIfExists: jest.fn().mockResolvedValue(true),
  };

  return mockDb;
};

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}));

function createTestApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  const createFeedbackRouter = require('../routes/feedback');
  const mockDb = createMockDb();

  app.use('/api/feedback', createFeedbackRouter({ db: mockDb }));

  app.use((_req, res) => res.status(404).json({ success: false, error: 'Not found' }));

  return app;
}

describe('Feedback API Route', () => {
  let app;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();

    mockReturning.mockResolvedValue([
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        created_at: new Date().toISOString(),
      },
    ]);
  });

  it('accepts a valid feedback submission', async () => {
    const payload = {
      message: 'Love the app, but the gallery could load faster.',
      category: 'gallery',
      url: 'https://example.com/gallery',
      context: { build: 'test', extra: true },
    };

    const response = await request(app)
      .post('/api/feedback')
      .send(payload)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.id).toBe('123e4567-e89b-12d3-a456-426614174000');

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: payload.message,
        category: payload.category,
        url: payload.url,
        context: payload.context,
        status: 'new',
      }),
    );
  });

  it('rejects missing message', async () => {
    const response = await request(app)
      .post('/api/feedback')
      .send({ category: 'gallery' })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Validation failed');
  });

  it('rejects empty message', async () => {
    await request(app)
      .post('/api/feedback')
      .send({ message: '   ' })
      .expect(400);
  });

  it('trims message input', async () => {
    await request(app)
      .post('/api/feedback')
      .send({ message: '  hello  ' })
      .expect(200);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'hello',
      }),
    );
  });
});
