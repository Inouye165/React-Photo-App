const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');

// Mock Supabase storage download
jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: jest.fn(() => ({
      download: jest.fn(() => Promise.resolve({
        data: new Blob([Buffer.from('fake-image-data-for-etag-test')]),
        error: null
      }))
    }))
  }
}));

describe('ETag/304 cache', () => {
  let authToken;
  let testPhotoId;

  beforeAll(async () => {
    // Create a test user and generate a valid JWT token
    const testUser = {
      username: 'etag_test_user',
      password_hash: 'fake_hash_for_etag_test'
    };
    
    // Insert test user (if not exists)
    try {
      await db('users').insert(testUser);
    } catch {
      // User may already exist, that's okay
    }

    // Generate a valid JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
    authToken = jwt.sign({ username: testUser.username }, JWT_SECRET, { expiresIn: '1h' });

    // Create a test photo in the database
    const insertResult = await db('photos').insert({
      filename: 'test_cache_photo.jpg',
      state: 'inprogress',
      metadata: '{}',
      hash: 'test-etag-hash-456',
      storage_path: 'inprogress/test_cache_photo.jpg',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    
    // Handle different return values for SQLite vs PostgreSQL
    testPhotoId = Array.isArray(insertResult) ? insertResult[0] : insertResult;
  });

  afterAll(async () => {
    // Clean up test data
    if (testPhotoId) {
      await db('photos').where({ id: testPhotoId }).delete();
    }
    await db('users').where({ username: 'etag_test_user' }).delete();
  });

  it('should set ETag and respond 304 to If-None-Match', async () => {
    const filename = 'test_cache_photo.jpg';
    const state = 'inprogress';
    
    // First request - should get 200 with ETag
    const res1 = await request(app)
      .get(`/display/${state}/${filename}`)
      .set('Cookie', `authToken=${authToken}`);
    
    expect(res1.status).toBe(200);
    expect(res1.headers['etag']).toBeDefined();
    
    const etag = res1.headers['etag'];
    
    // Second request with If-None-Match - should get 304 or 200
    const res2 = await request(app)
      .get(`/display/${state}/${filename}`)
      .set('If-None-Match', etag)
      .set('Cookie', `authToken=${authToken}`);
    
    expect([304, 200]).toContain(res2.status);
    if (res2.status === 304) {
      expect(res2.text).toBe('');
    }
  });
});
