/**
 * Photos state management tests
 * 
 * Note: Test Express apps intentionally omit CSRF middleware for isolated unit testing.
 * codeql[js/missing-token-validation] - Test file: CSRF intentionally omitted for unit testing
 */
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

const createPhotosRouter = require('../routes/photos');
const db = require('../db/index');
const { mockStorageHelpers, mockDbHelpers } = require('./setup');
const { addAIJob } = require('../queue/index');

let app;
let authToken = 'valid-token';

beforeEach(() => {
  app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Clear mock calls
  jest.clearAllMocks();

  // Configure the shared mock
  // Note: supabase.auth.getUser is already a jest.fn() from __mocks__/supabase.js
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

  app.use('/photos', createPhotosRouter({ db, supabase }));
});

test('PATCH /photos/:id/state moves photo, triggers fallback copy, and queues AI job (async)', async () => {
  // Ensure default data is loaded
  const photos = mockDbHelpers.getMockPhotos();
  expect(photos.length).toBeGreaterThan(0);

  const photo = photos.find(p => p.state === 'working');
  expect(photo).toBeDefined();

  // Add the source file to mock storage so download/upload can work
  const sourcePath = `${photo.state}/${photo.filename}`;
  mockStorageHelpers.addMockFile('photos', sourcePath, { size: 1234 });
  mockStorageHelpers.setMockMoveError('photos', sourcePath, { message: 'Object not found', status: 404 });

  const res = await request(app)
    .patch(`/photos/${photo.id}/state`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({ state: 'inprogress' })
    .expect(202);

  expect(res.body).toHaveProperty('success', true);
  expect(res.body).toHaveProperty('status', 'processing');

  // Verify the fallback copy happened
  const newPath = `inprogress/${photo.filename}`;
  expect(mockStorageHelpers.hasMockFile('photos', newPath)).toBe(true);

  // And the DB should be updated
  const updatedPhoto = await db('photos').where({ id: photo.id }).first();
  expect(updatedPhoto.state).toBe('inprogress');
  expect(updatedPhoto.storage_path).toBe(newPath);

  // Verify AI job was queued
  expect(addAIJob).toHaveBeenCalledWith(photo.id, expect.any(Object));
});
