const request = require('supertest');

// Mock Supabase
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser
    }
  })
}));

const app = require('../server');
const db = require('../db/index');

// Mock Supabase storage download
jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: jest.fn(() => ({
      download: jest.fn(() => Promise.resolve({
        data: new Blob([Buffer.from('fake-image-data')]),
        error: null
      }))
    }))
  }
}));

describe('GET /display/inprogress/:filename', () => {
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
      hash: 'test-hash-123',
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
    // No need to clean up users table - it no longer exists
  });

  beforeEach(() => {
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ 
      data: { 
        user: { 
          id: 1, 
          email: 'test@example.com',
          user_metadata: { username: 'cache_test_user', role: 'user' }
        } 
      }, 
      error: null 
    });
  });

  it('should include Cache-Control header with max-age', async () => {
    const filename = 'test_cache_photo.jpg';
    const res = await request(app)
      .get(`/display/inprogress/${filename}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(res.headers['cache-control']).toMatch(/max-age=\d+/);
    expect(res.headers['cache-control']).toMatch(/public/);
    expect(res.headers['etag']).toBeDefined();
  });
});
