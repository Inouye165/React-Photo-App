const createEventsRouter = require('../routes/events.ts');

function createReqRes({ userId } = {}) {
  const req = {
    user: userId ? { id: userId } : undefined,
    headers: {},
    query: {},
    get: jest.fn((name) => {
      const key = String(name || '').toLowerCase();
      return req.headers[key];
    }),
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

  test('authenticated request returns 426 for WebSocket upgrade', () => {
    const authenticateToken = (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    };

    const router = createEventsRouter({ authenticateToken });

    const layer = router.stack.find((l) => l.route && l.route.path === '/photos');
    expect(layer).toBeTruthy();

    const handlers = layer.route.stack.map((s) => s.handle);
    expect(handlers.length).toBeGreaterThanOrEqual(2);

    const { req, res } = createReqRes({ userId: 'user-1' });

    return runAuthed(handlers, req, res).then(() => {
      expect(res.status).toHaveBeenCalledWith(426);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'WebSocket upgrade required',
      }));
    });
  });

  test('kill switch returns 503 JSON and does not start a stream', async () => {
    const prev = process.env.REALTIME_EVENTS_DISABLED;
    process.env.REALTIME_EVENTS_DISABLED = '1';

    const authenticateToken = (req, _res, next) => {
      req.user = { id: 'user-1' };
      next();
    };

    const router = createEventsRouter({ authenticateToken });
    const layer = router.stack.find((l) => l.route && l.route.path === '/photos');
    const handlers = layer.route.stack.map((s) => s.handle);

    const { req, res } = createReqRes({ userId: 'user-1' });
    await runAuthed(handlers, req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Real-time events disabled' }));
    expect(res.write).not.toHaveBeenCalled();

    if (prev === undefined) delete process.env.REALTIME_EVENTS_DISABLED;
    else process.env.REALTIME_EVENTS_DISABLED = prev;
  });

  test('unauthenticated request is rejected by auth middleware before handler', () => {
    const authenticateToken = (_req, res, _next) => res.status(401).json({ success: false, error: 'Unauthorized' });

    const router = createEventsRouter({ authenticateToken });
    const layer = router.stack.find((l) => l.route && l.route.path === '/photos');
    const handlers = layer.route.stack.map((s) => s.handle);

    const { req, res } = createReqRes();
    handlers[0](req, res, () => handlers[1](req, res));

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    expect(res.write).not.toHaveBeenCalled();
  });
});
