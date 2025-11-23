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

test('PATCH /photos/:id/state moves photo and triggers fallback copy when move fails', async () => {
  // Ensure default data is loaded
  const photos = mockDbHelpers.getMockPhotos();
  expect(photos.length).toBeGreaterThan(0);

  const photo = photos.find(p => p.state === 'working');
  expect(photo).toBeDefined();

  // Add the source file to mock storage so download/upload can work
  // The route expects the file to be at `working/filename`
  const sourcePath = `${photo.state}/${photo.filename}`;
  mockStorageHelpers.addMockFile('photos', sourcePath, { size: 1234 });

  // Simulate a move error (but NOT a "not found" error initially)
  // The code first tries to move. If that fails, it checks if it's a "not found" error.
  // To trigger the fallback copy logic, we need the move to fail with "not found" OR 
  // fail with something else but then we want to test the fallback path.
  
  // Actually, looking at the code:
  // if (moveError) {
  //   if (alreadyExists) ...
  //   else if (!notFound) { return 500 }
  //   if (notFound && moveError) { attempt fallback }
  // }
  
  // So to trigger fallback, we need move() to return an error that looks like "not found"
  // AND the source file must actually exist (so download works).
  
  mockStorageHelpers.setMockMoveError('photos', sourcePath, { message: 'Object not found', status: 404 });

  const res = await request(app)
    .patch(`/photos/${photo.id}/state`)
    .set('Authorization', `Bearer ${authToken}`)
    .send({ state: 'inprogress' })
    .expect(200);

  expect(res.body).toHaveProperty('success', true);

  // Verify the fallback copy happened
  // The file should now exist at the new path
  const newPath = `inprogress/${photo.filename}`;
  expect(mockStorageHelpers.hasMockFile('photos', newPath)).toBe(true);
  
  // And the DB should be updated
  const updatedPhoto = await db('photos').where({ id: photo.id }).first();
  expect(updatedPhoto.state).toBe('inprogress');
  expect(updatedPhoto.storage_path).toBe(newPath);
});
