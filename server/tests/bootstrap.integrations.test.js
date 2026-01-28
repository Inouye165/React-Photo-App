describe('bootstrap/startIntegrations + shutdown', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function createKnexStub() {
    const target = jest.fn(() => target);
    return new Proxy(target, {
      get(obj, prop) {
        if (prop in obj) return obj[prop];
        return jest.fn(() => obj);
      },
      apply(obj, thisArg, args) {
        return obj(...args);
      },
    });
  }

  function createSupabaseStub() {
    return {
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn(),
          download: jest.fn(),
          remove: jest.fn(),
          createSignedUrl: jest.fn(),
        })),
        listBuckets: jest.fn(async () => ({ data: [], error: null })),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({ data: [], error: null })),
      })),
    };
  }

  test('does not start realtime subscriber on import; starts only via startIntegrations; stops via shutdown hook', async () => {
    const start = jest.fn(async () => ({ started: true }));
    const stop = jest.fn(async () => undefined);

    const createPhotoStatusSubscriber = jest.fn(() => ({ start, stop }));

    jest.doMock('../realtime/photoStatusSubscriber', () => ({
      createPhotoStatusSubscriber,
    }));

    // Avoid real timers/network; keep smoke-check lightweight.
    jest.doMock('../smoke-supabase', () => jest.fn(async () => true));

    const { createApp } = require('../bootstrap/createApp');
    const { startIntegrations } = require('../bootstrap/startIntegrations');
    const { createShutdownManager } = require('../bootstrap/shutdown');

    // Importing/creating app must not start integrations.
    const { socketManager } = createApp({
      db: createKnexStub(),
      supabase: createSupabaseStub(),
      logger: console,
    });

    expect(createPhotoStatusSubscriber).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();

    const { handles } = startIntegrations({ logger: console, socketManager, supabase: createSupabaseStub() });

    expect(createPhotoStatusSubscriber).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);

    const shutdownManager = createShutdownManager({ logger: console });
    for (const h of handles) shutdownManager.register(h.name, h.stop);

    await shutdownManager.shutdown('test');

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
