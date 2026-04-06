const { createSocketManager } = require('../realtime/SocketManager');

function createFakeSocket() {
  const handlers = {};
  const ws = {
    OPEN: 1,
    readyState: 1,
    bufferedAmount: 0,
    send: jest.fn(),
    close: jest.fn(),
    ping: jest.fn(),
    terminate: jest.fn(),
    on: jest.fn((event, handler) => {
      handlers[event] = handler;
    }),
    _emit: (event, ...args) => {
      if (handlers[event]) handlers[event](...args);
    },
  };
  return ws;
}

describe('realtime/SocketManager', () => {
  test('publishToUser only writes to that user connections', () => {
    const mgr = createSocketManager({ heartbeatMs: 0, generateId: () => 'evt-fixed' });

    const resA1 = createFakeSocket();
    const resA2 = createFakeSocket();
    const resB1 = createFakeSocket();

    mgr.addClient('userA', resA1);
    mgr.addClient('userA', resA2);
    mgr.addClient('userB', resB1);

    mgr.publishToUser('userA', 'photo.processing', { photoId: 'p1', status: 'finished' });

    expect(resA1.send).toHaveBeenCalled();
    expect(resA2.send).toHaveBeenCalled();
    expect(resB1.send).not.toHaveBeenCalled();

    const payload = JSON.parse(String(resA1.send.mock.calls[0][0]));
    expect(payload.type).toBe('photo.processing');
    expect(payload.eventId).toBe('evt-fixed');
  });

  test('publishToUser uses upstream payload.eventId when provided', () => {
    const mgr = createSocketManager({ heartbeatMs: 0, generateId: () => 'evt-generated' });
    const res = createFakeSocket();
    mgr.addClient('u1', res);

    mgr.publishToUser('u1', 'photo.processing', { eventId: 'evt-upstream', photoId: 'p1', status: 'finished' });

    const payload = JSON.parse(String(res.send.mock.calls[0][0]));
    expect(payload.eventId).toBe('evt-upstream');
  });

  test('publishToUser drops connection on backpressure and records reason', () => {
    const metrics = {
      incRealtimeConnect: jest.fn(),
      incRealtimeDisconnect: jest.fn(),
      incRealtimeDisconnectReason: jest.fn(),
      setRealtimeActiveConnections: jest.fn(),
    };

    const ws = createFakeSocket();
    ws.bufferedAmount = 99999;

    const mgr = createSocketManager({ heartbeatMs: 0, maxBufferedBytes: 1024, metrics });
    mgr.addClient('u1', ws);

    mgr.publishToUser('u1', 'photo.processing', { photoId: 'p1', status: 'finished' });

    expect(metrics.incRealtimeDisconnect).toHaveBeenCalled();
    expect(metrics.incRealtimeDisconnectReason).toHaveBeenCalledWith('backpressure_drop');
  });

  test('canAcceptClient enforces per-user cap', () => {
    const mgr = createSocketManager({ heartbeatMs: 0, maxConnectionsPerUser: 1 });
    const res1 = createFakeSocket();
    const res2 = createFakeSocket();

    expect(mgr.addClient('u1', res1)).toBeTruthy();
    expect(mgr.canAcceptClient('u1')).toBe(false);
    expect(mgr.addClient('u1', res2)).toBeTruthy();
  });
});
