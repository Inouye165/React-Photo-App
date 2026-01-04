
const request = require('supertest');
const express = require('express');
const { getRedisClient } = require('../lib/redis');

// Mock the redis client wrapper
jest.mock('../lib/redis', () => ({
  getRedisClient: jest.fn()
}));

// Mock the queue module to avoid loading metrics/prom-client
jest.mock('../queue', () => ({
  addAIJob: jest.fn(),
  checkRedisAvailable: jest.fn().mockResolvedValue(true)
}));

// Mock the database and other dependencies
const mockDb = jest.fn(() => ({
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  then: jest.fn().mockResolvedValue([])
}));

// Mock dependencies
const mockSupabase = {
  storage: {
    from: jest.fn(() => ({
      getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'http://example.com/photo.jpg' } }),
      createSignedUrl: jest.fn().mockResolvedValue({ data: { signedUrl: 'http://example.com/signed.jpg' } })
    }))
  }
};

// Mock middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: '00000000-0000-0000-0000-000000000000' }; // Valid UUID
    next();
  }
}));

// Mock services
jest.mock('../services/photosDb', () => {
  return () => ({
    listPhotos: jest.fn().mockResolvedValue([
      { id: 1, filename: 'test.jpg', created_at: new Date(), state: 'finished' }
    ]),
    getPhotoById: jest.fn().mockResolvedValue({ id: 1, filename: 'test.jpg' }),
    getPhotoByAnyId: jest.fn().mockResolvedValue({ id: 1, filename: 'test.jpg' })
  });
});

// Setup Express app with the router
const createPhotosRouter = require('../routes/photos');
const app = express();
app.use(express.json());

describe('Photos Route Caching', () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock Redis client
    mockRedis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      on: jest.fn()
    };
    getRedisClient.mockReturnValue(mockRedis);
  });

  test('GET / should check Redis cache', async () => {
    // 1. First request - Cache Miss
    mockRedis.get.mockResolvedValue(null);
    
    const router = createPhotosRouter({ db: mockDb, supabase: mockSupabase });
    app.use('/photos', router);

    const res = await request(app).get('/photos');
    
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(mockRedis.get).toHaveBeenCalled();
    expect(mockRedis.set).toHaveBeenCalled();
    
    // Verify cache key format
    const expectedKey = `photos:list:00000000-0000-0000-0000-000000000000:all:50:start`;
    expect(mockRedis.get).toHaveBeenCalledWith(expectedKey);
  });

  test('GET / should return cached data if available', async () => {
    // 2. Second request - Cache Hit
    const cachedData = {
      success: true,
      userId: '00000000-0000-0000-0000-000000000000',
      photos: [{ id: 999, filename: 'cached.jpg' }],
      nextCursor: null
    };
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

    const router = createPhotosRouter({ db: mockDb, supabase: mockSupabase });
    // Reset app stack to avoid duplicate mounting
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/photos', router);

    const res = await request(testApp).get('/photos');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body.photos[0].id).toBe(999);
    // Should NOT call DB (we can't easily check the mockDb here as it's wrapped in services, 
    // but we can check that we got the cached data which is different from the service mock)
  });

  test('GET /:id should set Cache-Control header', async () => {
    const router = createPhotosRouter({ db: mockDb, supabase: mockSupabase });
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/photos', router);

    const res = await request(testApp).get('/photos/00000000-0000-0000-0000-000000000001');
    
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
  });
});
