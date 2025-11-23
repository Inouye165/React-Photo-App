const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Import the mocked supabase client
const supabase = require('../lib/supabaseClient');

const createPhotosRouter = require('../routes/photos');
const db = require('../db/index');
const { mockStorageHelpers } = require('./setup');

let app;
let victimToken = 'victim-token';
let attackerToken = 'attacker-token';

beforeEach(() => {
  app = express();
  app.use(cookieParser());
  app.use(express.json());

  // Configure the shared mock to handle different tokens
  supabase.auth.getUser.mockReset();
  supabase.auth.getUser.mockImplementation(async (token) => {
    if (token === victimToken) {
      return { 
        data: { 
          user: { 
            id: 999, // Victim ID
            email: 'victim@example.com',
            user_metadata: { username: 'victim', role: 'user' }
          } 
        }, 
        error: null 
      };
    } else if (token === attackerToken) {
      return { 
        data: { 
          user: { 
            id: 666, // Attacker ID
            email: 'attacker@example.com',
            user_metadata: { username: 'attacker', role: 'user' }
          } 
        }, 
        error: null 
      };
    }
    return { data: { user: null }, error: { message: 'Invalid token' } };
  });

  app.use(createPhotosRouter({ db }));
});

describe('IDOR Vulnerability in Legacy Display Route', () => {
  test('Victim SHOULD be able to access their own photo', async () => {
    // 1. Setup: Create a photo belonging to the victim
    const victimId = 999;
    const filename = 'victim_secret_legacy.jpg';
    
    await db('photos').insert({
      user_id: victimId,
      filename: filename,
      state: 'working',
      storage_path: `working/${filename}`,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Add file to mock storage
    mockStorageHelpers.addMockFile('photos', `working/${filename}`, { size: 1024 });

    // 2. Victim requests their own photo
    const res = await request(app)
      .get(`/display/working/${filename}`)
      .set('Authorization', `Bearer ${victimToken}`);
    
    expect(res.status).toBe(200);
  });

  test('Attacker SHOULD NOT be able to access victim photo', async () => {
    // 1. Setup: Ensure victim photo exists (from previous test or new insert)
    const victimId = 999;
    const filename = 'victim_secret_legacy_2.jpg';
    
    await db('photos').insert({
      user_id: victimId,
      filename: filename,
      state: 'working',
      storage_path: `working/${filename}`,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Add file to mock storage
    mockStorageHelpers.addMockFile('photos', `working/${filename}`, { size: 1024 });

    // 2. Attacker requests victim's photo
    const res = await request(app)
      .get(`/display/working/${filename}`)
      .set('Authorization', `Bearer ${attackerToken}`);
    
    // 3. Expect 404 (Not Found) because the query filters by user_id
    // The endpoint does: .where({ filename, state }).andWhere({ user_id: req.user.id })
    // So for the attacker, it won't find the row.
    expect(res.status).toBe(404);
  });
});
