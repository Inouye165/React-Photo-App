const { EventEmitter } = require('events');

describe('queue/index photo status publishing', () => {
  test('on completed publishes status=finished', async () => {
    const { __private__ } = require('../queue/index');
    const { attachPhotoStatusPublisher, PHOTO_STATUS_CHANNEL } = __private__;

    const worker = new EventEmitter();
    const publish = jest.fn().mockResolvedValue(1);
    const redis = { publish };
    const db = jest.fn(() => ({
      where: () => ({
        select: () => ({
          first: async () => ({ user_id: 'userA' }),
        }),
      }),
    }));

    attachPhotoStatusPublisher({ worker, redis, db });

    worker.emit('completed', { id: 'job1', data: { photoId: 'photo1' } });

    // wait for async listener
    await new Promise((r) => setImmediate(r));

    expect(publish).toHaveBeenCalledTimes(1);
    const [channel, message] = publish.mock.calls[0];
    expect(channel).toBe(PHOTO_STATUS_CHANNEL);
    expect(JSON.parse(message)).toEqual(expect.objectContaining({
      userId: 'userA',
      photoId: 'photo1',
      status: 'finished',
      updatedAt: expect.any(String),
      eventId: expect.any(String),
    }));
  });

  test('on failed publishes status=failed only for terminal failure', async () => {
    const { __private__ } = require('../queue/index');
    const { attachPhotoStatusPublisher } = __private__;

    const worker = new EventEmitter();
    const publish = jest.fn().mockResolvedValue(1);
    const redis = { publish };
    const db = jest.fn(() => ({
      where: () => ({
        select: () => ({
          first: async () => ({ user_id: 'userB' }),
        }),
      }),
    }));

    attachPhotoStatusPublisher({ worker, redis, db });

    // non-terminal failure (attemptsMade < attempts)
    worker.emit('failed', { id: 'job2', data: { photoId: 'photo2' }, opts: { attempts: 3 }, attemptsMade: 1 });
    await new Promise((r) => setImmediate(r));
    expect(publish).toHaveBeenCalledTimes(0);

    // terminal failure (attemptsMade >= attempts)
    worker.emit('failed', { id: 'job2', data: { photoId: 'photo2' }, opts: { attempts: 3 }, attemptsMade: 3 });
    await new Promise((r) => setImmediate(r));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(JSON.parse(publish.mock.calls[0][1])).toEqual(expect.objectContaining({
      userId: 'userB',
      photoId: 'photo2',
      status: 'failed',
    }));
  });
});
