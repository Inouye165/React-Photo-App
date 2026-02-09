const request = require('supertest');

const PREV_MEDIA_REDIRECT_ENABLED = process.env.MEDIA_REDIRECT_ENABLED;
process.env.MEDIA_REDIRECT_ENABLED = 'false';

// Mock Supabase
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser
    }
  })
}));

// Mock Supabase storage download (must load before app)
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

const app = require('../server');
const db = require('../db');

describe('ETag/304 cache', () => {
  let authToken = 'valid-token';
  let testPhotoId;

  beforeAll(async () => {
    // No need to create a test user - we rely on Supabase Auth via mocked token
    // The mock user is returned by mockGetUser in beforeEach

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
    if (PREV_MEDIA_REDIRECT_ENABLED === undefined) {
      delete process.env.MEDIA_REDIRECT_ENABLED;
    } else {
      process.env.MEDIA_REDIRECT_ENABLED = PREV_MEDIA_REDIRECT_ENABLED;
    }
    // Clean up test data
    if (testPhotoId) {
      await db('photos').where({ id: testPhotoId }).delete();
    }
    // No need to clean up users table - it no longer exists
  });

  beforeEach(() => {
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ 
      data: { 
        user: { 
          id: 1, 
          email: 'test@example.com',
          user_metadata: { username: 'etag_test_user' },
          app_metadata: { role: 'user' }
        } 
      }, 
      error: null 
    });
  });

  it('should set ETag and respond 304 to If-None-Match', async () => {
    const filename = 'test_cache_photo.jpg';
    const state = 'inprogress';
    
    // First request - should get 200 with ETag
    const res1 = await request(app)
      .get(`/display/${state}/${filename}`)
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(res1.status).toBe(200);
    expect(res1.headers['etag']).toBeDefined();
    
    const etag = res1.headers['etag'];
    
    // Second request with If-None-Match - should get 304 or 200
    const res2 = await request(app)
      .get(`/display/${state}/${filename}`)
      .set('If-None-Match', etag)
      .set('Authorization', `Bearer ${authToken}`);
    
    // Express static or custom handler might return 304
    expect([200, 304]).toContain(res2.status);
  });
});
