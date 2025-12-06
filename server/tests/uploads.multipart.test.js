/**
 * Tests for multipart uploads with client-side thumbnails.
 */

// Mock dependencies
jest.mock('knex');
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());

const request = require('supertest');
const express = require('express');

// Mock queue functions
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  checkRedisAvailable: jest.fn().mockResolvedValue(false)
}));

const createUploadsRouter = require('../routes/uploads');
const supabase = require('../lib/supabaseClient');

// Mock DB
const createMockDb = () => {
  const mockKnex = jest.fn(() => ({
    where: jest.fn(() => ({
      select: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null)
      })),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(1)
    })),
    insert: jest.fn(() => ({
      returning: jest.fn().mockResolvedValue([{
        id: 1,
        filename: 'test.jpg',
        hash: 'mock-hash',
        storage_path: 'photos/mock-hash.jpg'
      }])
    })),
    select: jest.fn(() => ({
      first: jest.fn().mockResolvedValue(null)
    }))
  }));
  return mockKnex;
};

describe('Multipart Uploads (Photo + Thumbnail)', () => {
  let app;
  let mockDb;
  let uploadMock;

  beforeEach(() => {
    mockDb = createMockDb();
    
    // Setup Supabase mock
    uploadMock = jest.fn().mockResolvedValue({ data: { path: 'some-path' }, error: null });
    const removeMock = jest.fn().mockResolvedValue({});
    
    supabase.storage.from = jest.fn().mockReturnValue({
      upload: uploadMock,
      remove: removeMock,
      getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: '' } }),
      createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: '' } }),
      list: jest.fn().mockResolvedValue({ data: [] })
    });
    
    // Reset mocks
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    // Mock auth middleware
    app.use((req, res, next) => {
      req.user = { id: 1, email: 'test@example.com' };
      next();
    });
    
    app.use('/uploads', createUploadsRouter({ db: mockDb }));
  });

  test('Happy Path: Uploads both photo and thumbnail', async () => {
    const photoBuffer = Buffer.from('fake-photo-data');
    const thumbnailBuffer = Buffer.from('fake-thumbnail-data');

    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', photoBuffer, 'photo.jpg')
      .attach('thumbnail', thumbnailBuffer, 'thumbnail.jpg');

    expect(response.status).toBe(200);
    
    const calls = uploadMock.mock.calls;
    
    // One call should be for the photo (streaming)
    // One call should be for the thumbnail (buffer)
    
    const thumbnailUpload = calls.find(call => call[0].startsWith('thumbnails/'));
    const photoUpload = calls.find(call => !call[0].startsWith('thumbnails/')); 
    
    expect(photoUpload).toBeDefined();
    expect(thumbnailUpload).toBeDefined();
    
    // Check thumbnail headers
    expect(thumbnailUpload[2]).toMatchObject({
      contentType: 'image/jpeg',
      cacheControl: '31536000'
    });
  });

  test('Thumbnail Too Large: Ignores thumbnail but uploads photo', async () => {
    const photoBuffer = Buffer.from('fake-photo-data');
    // Create a large buffer > 200KB
    const largeThumbnail = Buffer.alloc(201 * 1024); 

    const response = await request(app)
      .post('/uploads/upload')
      .attach('photo', photoBuffer, 'photo.jpg')
      .attach('thumbnail', largeThumbnail, 'thumbnail.jpg');

    expect(response.status).toBe(200);

    const calls = uploadMock.mock.calls;
    const thumbnailUpload = calls.find(call => call[0].startsWith('thumbnails/'));
    
    expect(thumbnailUpload).toBeUndefined();
    // Photo should still be uploaded
    const photoUpload = calls.find(call => !call[0].startsWith('thumbnails/'));
    expect(photoUpload).toBeDefined();
  });
});
