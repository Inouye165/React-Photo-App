const { createSseManager, formatSseEvent } = require('../realtime/sseManager');

describe('realtime/sseManager', () => {
  test('formatSseEvent produces valid SSE framing', () => {
    const out = formatSseEvent({
      eventName: 'photo.processing',
      eventId: 'evt-123',
      data: { hello: 'world' },
    });

    expect(out).toContain('event: photo.processing\n');
    expect(out).toContain('id: evt-123\n');
    expect(out).toContain('data: ');
    expect(out.endsWith('\n\n')).toBe(true);

    const dataLine = out.split('\n').find((l) => l.startsWith('data: '));
    expect(dataLine).toBeTruthy();
    const json = JSON.parse(String(dataLine).slice('data: '.length));
    expect(json).toEqual({ hello: 'world' });
  });

  test('add/remove client updates per-user buckets and does not leak timers', () => {
    jest.useFakeTimers();

    const writes = [];
    const res = { write: (chunk) => writes.push(String(chunk)) };

    const mgr = createSseManager({ heartbeatMs: 10 });

    expect(mgr.getUserClientCount('u1')).toBe(0);
    expect(mgr.addClient('u1', res).ok).toBe(true);
    expect(mgr.getUserClientCount('u1')).toBe(1);

    jest.advanceTimersByTime(25);
    expect(writes.some((w) => w.includes(': ping'))).toBe(true);

    mgr.removeClient('u1', res);
    expect(mgr.getUserClientCount('u1')).toBe(0);

    const before = writes.length;
    jest.advanceTimersByTime(50);
    expect(writes.length).toBe(before);

    jest.useRealTimers();
  });

  test('publishToUser only writes to that user connections', () => {
    const resA1 = { write: jest.fn() };
    const resA2 = { write: jest.fn() };
    const resB1 = { write: jest.fn() };

    const mgr = createSseManager({ heartbeatMs: 0, generateId: () => 'evt-fixed' });
    mgr.addClient('userA', resA1);
    mgr.addClient('userA', resA2);
    mgr.addClient('userB', resB1);

    mgr.publishToUser('userA', 'photo.processing', { photoId: 'p1', status: 'finished' });

    expect(resA1.write).toHaveBeenCalled();
    expect(resA2.write).toHaveBeenCalled();
    expect(resB1.write).not.toHaveBeenCalled();

    const payload = String(resA1.write.mock.calls[0][0]);
    expect(payload).toContain('event: photo.processing\n');
    expect(payload).toContain('id: evt-fixed\n');
    expect(payload).toContain('data: ');
  });

  test('canAcceptClient enforces per-user cap', () => {
    const mgr = createSseManager({ heartbeatMs: 0, maxConnectionsPerUser: 1 });
    const res1 = { write: jest.fn() };
    const res2 = { write: jest.fn() };

    expect(mgr.addClient('u1', res1).ok).toBe(true);
    expect(mgr.canAcceptClient('u1')).toBe(false);
    expect(mgr.addClient('u1', res2).ok).toBe(false);
  });
});
