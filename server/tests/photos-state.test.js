const request = require('supertest');
const express = require('express');

const createPhotosRouter = require('../routes/photos');
const db = require('../db/index');
const { mockStorageHelpers, mockDbHelpers } = require('./setup');

let app;

beforeEach(() => {
  app = express();
  app.use(express.json());
  app.use(createPhotosRouter({ db }));
});

test('PATCH /photos/:id/state moves photo and triggers fallback copy when move fails', async () => {
  // Ensure default data is loaded
  const photos = mockDbHelpers.getMockPhotos();
  expect(photos.length).toBeGreaterThan(0);

  const photo = photos.find(p => p.state === 'working');
  expect(photo).toBeDefined();

  // Add the source file to mock storage so download/upload can work
  mockStorageHelpers.addMockFile('photos', photo.storage_path, { size: 1024 });

  // Force the move operation to fail with a 404 so our fallback copy runs
  mockStorageHelpers.setMockMoveError('photos', photo.storage_path, { message: 'Simulated move failure', status: 404 });

  // Call the endpoint without auth (router mounted directly in test)
  const res = await request(app)
    .patch(`/photos/${photo.id}/state`)
    .send({ state: 'inprogress' })
    .expect(200);

  expect(res.body).toHaveProperty('success', true);

  // Verify DB was updated to new state and storage_path
  // Use mockDbHelpers to inspect mock storage directly
  const allPhotos = mockDbHelpers.getMockPhotos();
  const updated = allPhotos.find(p => p.id == photo.id);
  expect(updated).toBeDefined();
  expect(updated.state).toBe('inprogress');
  expect(updated.storage_path).toBe(`inprogress/${photo.filename}`);

  // Verify mock storage now contains the new file path
  expect(mockStorageHelpers.hasMockFile('photos', `inprogress/${photo.filename}`)).toBe(true);
  // And original file removed (remove is best-effort; mock move deletes it)
  expect(mockStorageHelpers.hasMockFile('photos', photo.storage_path)).toBe(false);
});
