const createEventsRouter = require('../routes/events');

function createReqRes({ userId } = {}) {
  const req = {
    user: userId ? { id: userId } : undefined,
    headers: {},
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
    _headers: headers,
  };

  return { req, res };
}

describe('routes/events GET /events/photos (unit)', () => {
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

    handlers[0](req, res, () => handlers[1](req, res));

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
