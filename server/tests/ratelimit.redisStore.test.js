/* eslint-env jest */

describe('rateLimitStore', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test('does not initialize Redis store in test env', () => {
    process.env.NODE_ENV = 'test';
    process.env.REDIS_URL = 'redis://localhost:6379';

    const createRedisConnection = jest.fn();
    const RedisStore = jest.fn();

    jest.doMock('../redis/connection', () => ({ createRedisConnection }));
    jest.doMock('rate-limit-redis', () => ({ RedisStore }));

    const { getRateLimitStore } = require('../middleware/rateLimitStore');

    expect(getRateLimitStore()).toBeUndefined();
    expect(createRedisConnection).not.toHaveBeenCalled();
    expect(RedisStore).not.toHaveBeenCalled();
  });

  test('returns a new store instance per limiter (prevents ERR_ERL_STORE_REUSE)', () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://localhost:6379';

    const createRedisConnection = jest.fn(() => ({ call: jest.fn() }));
    const RedisStore = jest.fn(function MockRedisStore() {
      this.prefix = 'rl:';
      this.init = jest.fn();
      this.increment = jest.fn();
      this.decrement = jest.fn();
      this.resetKey = jest.fn();
      this.get = jest.fn();
      this.shutdown = jest.fn();
    });

    jest.doMock('../redis/connection', () => ({ createRedisConnection }));
    jest.doMock('rate-limit-redis', () => ({ RedisStore }));

    const { getRateLimitStore } = require('../middleware/rateLimitStore');

    const storeA = getRateLimitStore();
    const storeB = getRateLimitStore();

    expect(storeA).toBeDefined();
    expect(storeB).toBeDefined();
    expect(storeA).not.toBe(storeB);
  });
});
