const { EventEmitter } = require('events');

describe('queue/index photo status publishing', () => {
  test('shouldPublishTerminalFailure matches attempts matrix', () => {
    const { __private__ } = require('../queue/index');
    const { shouldPublishTerminalFailure } = __private__;

    const cases = [
      { attempts: 1, attemptsMade: 0, expected: true },
      { attempts: 2, attemptsMade: 0, expected: false },
      { attempts: 2, attemptsMade: 1, expected: true },
      { attempts: 3, attemptsMade: 0, expected: false },
      { attempts: 3, attemptsMade: 1, expected: false },
      { attempts: 3, attemptsMade: 2, expected: true },
    ];

    for (const c of cases) {
      expect(
        shouldPublishTerminalFailure({ opts: { attempts: c.attempts }, attemptsMade: c.attemptsMade })
      ).toBe(c.expected);
    }
  });

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

  test('on failed publishes status=failed only for terminal failure (exactly once)', async () => {
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

    // non-terminal failure
    worker.emit('failed', { id: 'job2', data: { photoId: 'photo2' }, opts: { attempts: 3 }, attemptsMade: 1 });
    await new Promise((r) => setImmediate(r));
    expect(publish).toHaveBeenCalledTimes(0);

    // terminal failure (attemptsMade + 1 >= attempts)
    const terminalJob = { id: 'job2', data: { photoId: 'photo2' }, opts: { attempts: 3 }, attemptsMade: 2 };
    worker.emit('failed', terminalJob);
    await new Promise((r) => setImmediate(r));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(JSON.parse(publish.mock.calls[0][1])).toEqual(expect.objectContaining({
      userId: 'userB',
      photoId: 'photo2',
      status: 'failed',
    }));

    // emit again with same job object: should not publish twice
    worker.emit('failed', terminalJob);
    await new Promise((r) => setImmediate(r));
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
