const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const db = require('../db/index');
const createPhotosRouter = require('../routes/photos');
const { mockStorageHelpers, mockDbHelpers } = require('./setup');

describe('IDOR Vulnerability in Legacy Display Route', () => {
  let app;
  let victimToken;
  let attackerToken;
  let victimUser;
  let attackerUser;
  const filename = 'victim_secret_legacy.jpg';

  beforeAll(async () => {
    // Setup App with the Photos Router mounted at /photos
    app = express();
    app.use(cookieParser());
    app.use('/photos', createPhotosRouter({ db }));
  });

  beforeEach(async () => {
    // Clear default data loaded by global setup
    mockDbHelpers.clearMockData();
    mockStorageHelpers.clearMockStorage();

    // Create users using helper
    victimUser = mockDbHelpers.addMockUser({ username: 'victim_legacy', password_hash: 'hash' });
    attackerUser = mockDbHelpers.addMockUser({ username: 'attacker_legacy', password_hash: 'hash' });

    // Tokens
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
    process.env.JWT_SECRET = JWT_SECRET;

    victimToken = jwt.sign({ id: victimUser.id, username: victimUser.username }, JWT_SECRET);
    attackerToken = jwt.sign({ id: attackerUser.id, username: attackerUser.username }, JWT_SECRET);

    // Create victim's photo using helper
    mockDbHelpers.addMockPhoto({
      user_id: victimUser.id,
      filename: filename,
      state: 'working',
      storage_path: `working/${filename}`,
      metadata: '{}',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Add file to mock storage so download works
    mockStorageHelpers.addMockFile('photos', `working/${filename}`, { size: 1024 });
  });

  afterAll(async () => {
    mockDbHelpers.clearMockData();
    mockStorageHelpers.clearMockStorage();
  });

  test('Attacker should NOT be able to access victim photo via legacy route', async () => {
    // The legacy route is at /photos/display/:state/:filename
    const res = await request(app)
      .get(`/photos/display/working/${filename}`)
      .set('Cookie', `authToken=${attackerToken}`);
    
    // If vulnerable, this returns 200. If fixed, it should return 404.
    if (res.status === 200) {
        console.log('VULNERABILITY CONFIRMED: Attacker accessed victim photo');
    }
    expect(res.status).toBe(404); 
  });

  test('Victim SHOULD be able to access their own photo', async () => {
    const res = await request(app)
      .get(`/photos/display/working/${filename}`)
      .set('Cookie', `authToken=${victimToken}`);
    
    expect(res.status).toBe(200);
  });
});
