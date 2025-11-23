// uploads.cleanup.test.js
// Test for compensating transaction: orphaned file cleanup on DB error

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { mockStorageHelpers } = require('./__mocks__/supabase');

jest.mock('../media/image', () => ({
  ingestPhoto: jest.fn()
}));
const { ingestPhoto } = require('../media/image');

const createUploadsRouter = require('../routes/uploads');

// Setup test app
function setupApp(db) {
  const app = express();
  app.use((req, res, next) => {
    req.user = { id: 123 };
    next();
  });
  app.use('/', createUploadsRouter({ db }));
  return app;
}

describe('Upload Route - Orphaned File Cleanup', () => {
  beforeEach(() => {
     mockStorageHelpers.clearMockStorage();
    ingestPhoto.mockReset();
  });

  it('removes orphaned file from storage if DB insert fails', async () => {
    // Arrange: ingestPhoto throws
    ingestPhoto.mockImplementation(() => { throw new Error('DB error'); });
    const db = {};
    const app = setupApp(db);
    // Create a temp file to upload
    const tempFilePath = path.join(os.tmpdir(), 'testfile.jpg');
    fs.writeFileSync(tempFilePath, Buffer.from('testdata'));
    // Act
    const res = await request(app)
      .post('/upload')
      .attach('photo', tempFilePath);
    // Assert
    expect(res.status).toBe(500);
    // The file should have been removed from storage
    const uploadedFiles = mockStorageHelpers.getMockFiles().filter(([key]) => key.startsWith('photos/'));
    expect(uploadedFiles).toHaveLength(0);
    // Cleanup
    fs.unlinkSync(tempFilePath);
  });
});
