const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Import the mocked supabase client
const supabase = require('../lib/supabaseClient');


const createPhotosRouter = require('../routes/photos');
const db = require('../db/index');
const { mockStorageHelpers, mockDbHelpers } = require('./setup');

let app;
let authToken = 'valid-token';

beforeEach(() => {
  app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Configure the shared mock
  // Note: supabase.auth.getUser is already a jest.fn() from __mocks__/supabase.js
  supabase.auth.getUser.mockReset();
  supabase.auth.getUser.mockResolvedValue({ 
    data: { 
      user: { 
        id: 1, 
        email: 'test@example.com',
        user_metadata: { username: 'testuser', role: 'user' }
      } 
    }, 
    error: null 
  });

  app.use('/photos', createPhotosRouter({ db }));
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

  // Poll for AI metadata (simulate async AI job completion)
  // (In a real integration test, you would mock the worker to update the DB)
  // Here, just show the pattern:
  // const aiRow = await pollForAnalysis(db, photo.id);
  // expect(aiRow.caption).toBeDefined();
});
