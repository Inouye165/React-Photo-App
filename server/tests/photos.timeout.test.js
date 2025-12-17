/**
 * Regression tests for GET /photos timeout behavior
 *
 * These tests focus on request-level behavior:
 * - Successful responses still work
 * - Knex timeouts are normalized to the legacy "DB query timeout" message
 */
/* eslint-env jest */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Import the mocked supabase client
const supabase = require('../lib/supabaseClient');

// Mock the queue module
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockResolvedValue(undefined),
  checkRedisAvailable: jest.fn().mockResolvedValue(false)
}));

// Mock photosDb so we can control listPhotos timing/errors
jest.mock('../services/photosDb');
const createPhotosDb = require('../services/photosDb');

const createPhotosRouter = require('../routes/photos');
const db = require('../db/index');

let app;

beforeEach(() => {
  app = express();
  app.use(cookieParser());
  app.use(express.json());

  jest.clearAllMocks();

  supabase.auth.getUser.mockReset();
  supabase.auth.getUser.mockResolvedValue({
    data: {
      user: {
        id: 1,
        email: 'test@example.com',
        user_metadata: { username: 'testuser' },
        app_metadata: { role: 'user' }
      }
    },
    error: null
  });
});

test('GET /photos returns 200 when listPhotos resolves', async () => {
  process.env.DB_QUERY_TIMEOUT_MS = '50';

  const listPhotos = jest.fn().mockResolvedValue([]);
  createPhotosDb.mockReturnValue({ listPhotos });

  app.use('/photos', createPhotosRouter({ db, supabase }));

  const res = await request(app)
    .get('/photos')
    .set('Authorization', 'Bearer valid-token')
    .expect(200);

  expect(res.body).toEqual({ success: true, photos: [] });
  expect(listPhotos).toHaveBeenCalledWith(1, undefined, expect.objectContaining({ timeoutMs: 50 }));
});

test('GET /photos returns 200 with authToken cookie (no Authorization header)', async () => {
  process.env.DB_QUERY_TIMEOUT_MS = '50';

  const listPhotos = jest.fn().mockResolvedValue([]);
  createPhotosDb.mockReturnValue({ listPhotos });

  app.use('/photos', createPhotosRouter({ db, supabase }));

  const res = await request(app)
    .get('/photos')
    .set('Cookie', ['authToken=valid-token'])
    .expect(200);

  expect(res.body).toEqual({ success: true, photos: [] });
  expect(listPhotos).toHaveBeenCalledWith(1, undefined, expect.any(Object));
});

test('GET /photos returns 401 when no auth provided', async () => {
  const listPhotos = jest.fn().mockResolvedValue([]);
  createPhotosDb.mockReturnValue({ listPhotos });

  app.use('/photos', createPhotosRouter({ db, supabase }));

  await request(app)
    .get('/photos')
    .expect(401);

  // Ensure auth middleware short-circuited.
  expect(listPhotos).not.toHaveBeenCalled();
});

test('GET /photos normalizes Knex timeout errors to "DB query timeout"', async () => {
  process.env.DB_QUERY_TIMEOUT_MS = '1';

  const err = new Error('Defined query timeout of 1ms exceeded');
  err.name = 'KnexTimeoutError';

  const listPhotos = jest.fn().mockRejectedValue(err);
  createPhotosDb.mockReturnValue({ listPhotos });

  app.use('/photos', createPhotosRouter({ db, supabase }));

  const res = await request(app)
    .get('/photos')
    .set('Authorization', 'Bearer valid-token')
    .expect(500);

  expect(res.body.success).toBe(false);
  expect(res.body.error).toBe('DB query timeout');
  expect(typeof res.body.reqId).toBe('string');
  expect(res.body.reqId.length).toBeGreaterThan(0);
});
