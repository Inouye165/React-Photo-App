const request = require('supertest');
const express = require('express');

const createPhotosDb = require('../services/photosDb');

jest.mock('../lib/redis', () => {
  const actual = jest.requireActual('../lib/redis');
  return {
    ...actual,
    getRedisClient: jest.fn(),
  };
});

const { getRedisClient, photosListKeysIndexKey, invalidatePhotosListCacheForUserId } = require('../lib/redis');

// Mock the queue module to avoid loading metrics/prom-client
jest.mock('../queue', () => ({
  addAIJob: jest.fn(),
  checkRedisAvailable: jest.fn().mockResolvedValue(true)
}));

// Mock middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: '00000000-0000-0000-0000-000000000000' }; // Valid UUID
    next();
  }
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

function createMockDbForList(rows) {
  const builder = {
    where: jest.fn(function(...args) {
      if (typeof args[0] === 'function') {
        args[0].call(builder);
      }
      return builder;
    }),
    orWhere: jest.fn(function(...args) {
      if (typeof args[0] === 'function') {
        args[0].call(builder);
      }
      return builder;
    }),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    timeout: jest.fn().mockReturnThis(),
    then: jest.fn((resolve, reject) => Promise.resolve(rows).then(resolve, reject)),
  };

  const mockDb = jest.fn((_tableName) => builder);
  mockDb._builder = builder;
  return mockDb;
}

function createMockRedis() {
  const redis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    sadd: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    multi: jest.fn(() => ({
      setex: (...args) => redis.setex(...args),
      sadd: (...args) => redis.sadd(...args),
      expire: (...args) => redis.expire(...args),
      del: (...args) => redis.del(...args),
      exec: jest.fn().mockResolvedValue([]),
    })),
    on: jest.fn(),
  };
  return redis;
}

describe('Photos Listing Caching (Redis)', () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = createMockRedis();
    getRedisClient.mockReturnValue(mockRedis);
  });

  test('First request: DB is called, Redis is set', async () => {
    const mockRows = [
      { id: 1, filename: 'db.jpg', created_at: new Date().toISOString(), state: 'finished' }
    ];
    const mockDb = createMockDbForList(mockRows);

    mockRedis.get.mockResolvedValue(null);

    const createPhotosRouter = require('../routes/photos');
    const router = createPhotosRouter({ db: mockDb, supabase: mockSupabase });

    const app = express();
    app.use(express.json());
    app.use('/photos', router);

    const res = await request(app).get('/photos');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
    expect(mockDb).toHaveBeenCalled();
    expect(mockRedis.get).toHaveBeenCalled();
    expect(mockRedis.setex).toHaveBeenCalled();

    const expectedKey = createPhotosDb._private.buildPhotosListCacheKey({
      userId: '00000000-0000-0000-0000-000000000000',
      state: undefined,
      cursor: null,
      limit: 20,
    });
    expect(mockRedis.get).toHaveBeenCalledWith(expectedKey);
  });

  test('Second request: DB is NOT called, Redis returns data', async () => {
    const mockDb = createMockDbForList([
      { id: 1, filename: 'db.jpg', created_at: new Date().toISOString(), state: 'finished' }
    ]);

    const cachedRows = [
      { id: 999, filename: 'cached.jpg', created_at: new Date().toISOString(), state: 'finished' }
    ];
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedRows));

    const createPhotosRouter = require('../routes/photos');
    const router = createPhotosRouter({ db: mockDb, supabase: mockSupabase });

    const app = express();
    app.use(express.json());
    app.use('/photos', router);

    const res = await request(app).get('/photos');

    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
    expect(res.body.photos[0].id).toBe(999);
    expect(mockDb).not.toHaveBeenCalled();
  });

  test('Upload/Delete: Redis key is evicted (via helper used by upload + db writes)', async () => {
    const userId = '00000000-0000-0000-0000-000000000000';
    const cacheKey = createPhotosDb._private.buildPhotosListCacheKey({
      userId,
      state: undefined,
      cursor: null,
      limit: 20,
    });
    const indexKey = photosListKeysIndexKey(userId);

    mockRedis.smembers.mockResolvedValue([cacheKey]);

    const result = await invalidatePhotosListCacheForUserId(userId, { redis: mockRedis });
    expect(result.ok).toBe(true);
    expect(mockRedis.smembers).toHaveBeenCalledWith(indexKey);
    expect(mockRedis.del).toHaveBeenCalled();
  });

  test('Resilience: Redis connection failure still serves data from DB', async () => {
    const mockRows = [
      { id: 1, filename: 'db.jpg', created_at: new Date().toISOString(), state: 'finished' }
    ];
    const mockDb = createMockDbForList(mockRows);

    mockRedis.get.mockImplementation(() => {
      throw new Error('Redis down');
    });

    const createPhotosRouter = require('../routes/photos');
    const router = createPhotosRouter({ db: mockDb, supabase: mockSupabase });

    const app = express();
    app.use(express.json());
    app.use('/photos', router);

    const res = await request(app).get('/photos');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockDb).toHaveBeenCalled();
  });
});
