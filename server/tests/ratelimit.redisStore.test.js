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
});
