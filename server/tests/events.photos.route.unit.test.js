const createEventsRouter = require('../routes/events');

function createReqRes({ userId } = {}) {
  const req = {
    user: userId ? { id: userId } : undefined,
    headers: {},
    query: {},
    on: jest.fn(),
  };

  const headers = {};
  const res = {
    statusCode: 200,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    set: jest.fn((obj) => {
      Object.assign(headers, obj);
      return res;
    }),
    flushHeaders: jest.fn(),
    json: jest.fn(() => res),
    write: jest.fn(() => true),
    on: jest.fn(),
    end: jest.fn(),
    _headers: headers,
  };

  return { req, res };
}

describe('routes/events GET /events/photos (unit)', () => {
  async function runAuthed(handlers, req, res) {
    let nextCalled = false;
    handlers[0](req, res, () => {
      nextCalled = true;
    });
    if (nextCalled) {
      await handlers[1](req, res);
    }
  }

  test('authenticated request sets SSE headers and writes an initial event', () => {
    const sseManager = {
      canAcceptClient: () => true,
      addClient: jest.fn(() => ({ ok: true })),
      removeClient: jest.fn(),
    };

    const authenticateToken = (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    };

    const router = createEventsRouter({ authenticateToken, sseManager });

    const layer = router.stack.find((l) => l.route && l.route.path === '/photos');
    expect(layer).toBeTruthy();

    const handlers = layer.route.stack.map((s) => s.handle);
    expect(handlers.length).toBeGreaterThanOrEqual(2);

    const { req, res } = createReqRes({ userId: 'user-1' });

    return runAuthed(handlers, req, res).then(() => {
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res._headers['Content-Type']).toBe('text/event-stream');
      expect(res._headers['Cache-Control']).toBe('no-cache');
      expect(res._headers.Connection).toBe('keep-alive');
      expect(sseManager.addClient).toHaveBeenCalled();
      expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(res.write).toHaveBeenCalled();

      const firstWrite = String(res.write.mock.calls[0][0]);
      expect(firstWrite).toContain('event: connected\n');
      expect(firstWrite).toContain('id:');
      expect(firstWrite).toContain('data:');
      expect(firstWrite.endsWith('\n\n')).toBe(true);
    });

  });

  test('kill switch returns 503 JSON and does not start a stream', async () => {
    const prev = process.env.REALTIME_EVENTS_DISABLED;
    process.env.REALTIME_EVENTS_DISABLED = '1';

    const sseManager = {
      canAcceptClient: () => true,
      addClient: jest.fn(() => ({ ok: true })),
      removeClient: jest.fn(),
    };

    const authenticateToken = (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    };

    const router = createEventsRouter({ authenticateToken, sseManager, photoEventHistory: { getCatchupEvents: jest.fn() } });
    const layer = router.stack.find((l) => l.route && l.route.path === '/photos');
    const handlers = layer.route.stack.map((s) => s.handle);

    const { req, res } = createReqRes({ userId: 'user-1' });
    await runAuthed(handlers, req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Real-time events disabled' }));
    expect(res.write).not.toHaveBeenCalled();
    expect(sseManager.addClient).not.toHaveBeenCalled();

    if (prev === undefined) delete process.env.REALTIME_EVENTS_DISABLED;
    else process.env.REALTIME_EVENTS_DISABLED = prev;
  });

  test('since catch-up events are written before connected event', async () => {
    const sseManager = {
      canAcceptClient: () => true,
      addClient: jest.fn(() => ({ ok: true })),
      removeClient: jest.fn(),
    };

    const authenticateToken = (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    };

    const photoEventHistory = {
      getCatchupEvents: jest.fn().mockResolvedValue({
        ok: true,
        events: [
          { userId: 'user-1', eventId: 'evt-old', photoId: 'p1', status: 'processing', updatedAt: new Date().toISOString(), ts: Date.now() - 1000 },
        ],
      }),
    };

    const router = createEventsRouter({ authenticateToken, sseManager, photoEventHistory });
    const layer = router.stack.find((l) => l.route && l.route.path === '/photos');
    const handlers = layer.route.stack.map((s) => s.handle);

    const { req, res } = createReqRes({ userId: 'user-1' });
    req.query = { since: String(Date.now() - 10_000) };

    await runAuthed(handlers, req, res);

    expect(res.write).toHaveBeenCalled();
    const writes = res.write.mock.calls.map((c) => String(c[0]));
    expect(writes[0]).toContain('event: photo.processing\n');
    expect(writes[0]).toContain('id: evt-old\n');
    expect(writes.some((w) => w.includes('event: connected\n'))).toBe(true);
  });

  test('connection cap returns 429 JSON and does not start a stream', () => {
    const sseManager = {
      canAcceptClient: () => false,
      addClient: jest.fn(),
      removeClient: jest.fn(),
    };

    const authenticateToken = (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    };

    const router = createEventsRouter({ authenticateToken, sseManager });
    const layer = router.stack.find((l) => l.route && l.route.path === '/photos');
    const handlers = layer.route.stack.map((s) => s.handle);

    const { req, res } = createReqRes({ userId: 'user-1' });
    handlers[0](req, res, () => handlers[1](req, res));

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Too many concurrent event streams' });
    expect(res.write).not.toHaveBeenCalled();
    expect(sseManager.addClient).not.toHaveBeenCalled();
  });

  test('unauthenticated request is rejected by auth middleware before handler', () => {
    const sseManager = {
      canAcceptClient: () => true,
      addClient: jest.fn(),
      removeClient: jest.fn(),
    };

    const authenticateToken = (_req, res, _next) => res.status(401).json({ success: false, error: 'Unauthorized' });

    const router = createEventsRouter({ authenticateToken, sseManager });
    const layer = router.stack.find((l) => l.route && l.route.path === '/photos');
    const handlers = layer.route.stack.map((s) => s.handle);

    const { req, res } = createReqRes();
    handlers[0](req, res, () => handlers[1](req, res));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    expect(sseManager.addClient).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });
});
