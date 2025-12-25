const { createPhotoStatusSubscriber, CHANNEL, EVENT_NAME, __private__ } = require('../realtime/photoStatusSubscriber');

describe('realtime/photoStatusSubscriber', () => {
  test('routes valid message to publishToUser with correct userId/eventName/payload', async () => {
    const prevRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

    const publishToUser = jest.fn();
    const sseManager = { publishToUser };

    const handlers = {};
    const redis = {
      on: jest.fn((evt, fn) => {
        handlers[evt] = fn;
      }),
      subscribe: jest.fn().mockResolvedValue(1),
      unsubscribe: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    const subscriber = createPhotoStatusSubscriber({
      sseManager,
      createRedisConnection: () => redis,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    await subscriber.start();

    const payload = {
      userId: 'u1',
      eventId: 'evt1',
      photoId: 'p1',
      status: 'finished',
      updatedAt: new Date().toISOString(),
      progress: 100,
    };

    handlers.message(CHANNEL, JSON.stringify(payload));

    expect(publishToUser).toHaveBeenCalledWith('u1', EVENT_NAME, expect.objectContaining(payload));

    await subscriber.stop();

    if (prevRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = prevRedisUrl;
    }
  });

  test('ignores malformed JSON', () => {
    const parsed = __private__.parseAndValidateMessage('{not json');
    expect(parsed).toBeNull();
  });

  test('ignores payload missing required fields', () => {
    expect(__private__.parseAndValidateMessage(JSON.stringify({}))).toBeNull();
    expect(__private__.parseAndValidateMessage(JSON.stringify({ userId: 'u', photoId: 'p', status: 'finished', updatedAt: 't' }))).toBeNull(); // missing eventId
    expect(__private__.parseAndValidateMessage(JSON.stringify({ userId: 'u', eventId: 'e', status: 'finished', updatedAt: 't' }))).toBeNull(); // missing photoId
    expect(__private__.parseAndValidateMessage(JSON.stringify({ userId: 'u', eventId: 'e', photoId: 'p', updatedAt: 't' }))).toBeNull(); // missing status
  });
});
