describe('Queue worker resilience hardening', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.REDIS_URL = 'redis://example.test:6379';
  });

  test('startWorker configures lockDuration=60000 and stalledInterval=30000', async () => {
    let capturedWorkerOpts;

    jest.doMock('bullmq', () => {
      return {
        Queue: class MockQueue {
          constructor() {}
          add() {
            return { id: 'job-1' };
          }
        },
        Worker: class MockWorker {
          constructor(_name, _processor, opts) {
            capturedWorkerOpts = opts;
            this._listeners = {};
          }
          on(event, fn) {
            this._listeners[event] = fn;
          }
          close() {
            return Promise.resolve();
          }
        },
      };
    });

    jest.doMock('../redis/connection', () => {
      return {
        createRedisConnection: () => ({
          ping: () => Promise.resolve('PONG'),
          publish: () => Promise.resolve(1),
          disconnect: () => {},
          on: () => {},
        }),
      };
    });

    // Avoid pulling in real DB/AI/media modules for this unit test.
    jest.doMock('../db', () => ({}), { virtual: true });
    jest.doMock('../db/index', () => ({}), { virtual: true });
    jest.doMock('../ai/service', () => ({
      updatePhotoAIMetadata: jest.fn(),
    }));
    jest.doMock('../media/backgroundProcessor', () => ({
      processUploadedPhoto: jest.fn(),
    }));
    jest.doMock('../media/heicDisplayAsset', () => ({
      ensureHeicDisplayAsset: jest.fn(),
    }));
    jest.doMock('../lib/supabaseClient', () => ({
      storage: {
        from: () => ({}),
      },
    }));
    jest.doMock('../services/photosStorage', () => () => ({
      deletePhotos: jest.fn(),
      listPhotos: jest.fn(),
      downloadPhoto: jest.fn(),
    }));
    jest.doMock('../services/photosState', () => () => ({
      transitionState: jest.fn(),
    }));

    const { startWorker } = require('../queue');
    await startWorker();

    expect(capturedWorkerOpts).toEqual(
      expect.objectContaining({
        lockDuration: 60000,
        stalledInterval: 30000,
      })
    );
  });

  test('addAIJob propagates sanitized requestId and worker logs include it', async () => {
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    let workerInstance;
    let queueAddArgs;

    jest.doMock('../logger', () => logger);

    jest.doMock('bullmq', () => {
      return {
        Queue: class MockQueue {
          constructor() {}
          add(name, data, opts) {
            queueAddArgs = { name, data, opts };
            return { id: 'job-1' };
          }
        },
        Worker: class MockWorker {
          constructor(_name, _processor, _opts) {
            this._listeners = {};
            workerInstance = this;
          }
          on(event, fn) {
            this._listeners[event] = fn;
          }
          close() {
            return Promise.resolve();
          }
        },
      };
    });

    jest.doMock('../redis/connection', () => {
      return {
        createRedisConnection: () => ({
          ping: () => Promise.resolve('PONG'),
          publish: () => Promise.resolve(1),
          disconnect: () => {},
          on: () => {},
        }),
      };
    });

    // Avoid pulling in real DB/AI/media modules for this unit test.
    jest.doMock('../db', () => ({}), { virtual: true });
    jest.doMock('../db/index', () => ({}), { virtual: true });
    jest.doMock('../ai/service', () => ({
      updatePhotoAIMetadata: jest.fn(),
    }));
    jest.doMock('../media/backgroundProcessor', () => ({
      processUploadedPhoto: jest.fn(),
    }));
    jest.doMock('../media/heicDisplayAsset', () => ({
      ensureHeicDisplayAsset: jest.fn(),
    }));
    jest.doMock('../lib/supabaseClient', () => ({
      storage: {
        from: () => ({}),
      },
    }));
    jest.doMock('../services/photosStorage', () => () => ({
      deletePhotos: jest.fn(),
      listPhotos: jest.fn(),
      downloadPhoto: jest.fn(),
    }));
    jest.doMock('../services/photosState', () => () => ({
      transitionState: jest.fn(),
    }));

    const { addAIJob, startWorker } = require('../queue');
    await startWorker();

    await addAIJob('photo-123', { requestId: 'abc\r\nINJECT', processMetadata: true });

    expect(queueAddArgs).toEqual(
      expect.objectContaining({
        name: 'process-photo-ai',
        data: expect.objectContaining({
          photoId: 'photo-123',
          requestId: 'abcINJECT',
          processMetadata: true,
        }),
        opts: expect.objectContaining({
          attempts: 5,
          backoff: { type: 'exponential', delay: 60000 },
        }),
      })
    );

    // Simulate a completion event and ensure requestId is included/sanitized in logs.
    const completed = workerInstance?._listeners?.completed;
    expect(typeof completed).toBe('function');

    completed({
      id: 'job-1',
      name: 'process-photo-ai',
      data: { photoId: 'photo-123', requestId: 'abc\nINJECT' },
    });

    expect(logger.info).toHaveBeenCalledWith(
      '[WORKER] Job completed',
      expect.objectContaining({
        jobId: 'job-1',
        photoId: 'photo-123',
        requestId: 'abcINJECT',
      })
    );
  });
});
