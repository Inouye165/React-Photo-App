const { createPhotoEventHistory } = require('../realtime/photoEventHistory');

class MemoryRedis {
  constructor() {
    this.lists = new Map();
    this.expires = new Map();
  }

  _list(key) {
    const k = String(key);
    if (!this.lists.has(k)) this.lists.set(k, []);
    return this.lists.get(k);
  }

  async lpush(key, value) {
    this._list(key).unshift(String(value));
    return this._list(key).length;
  }

  async ltrim(key, start, stop) {
    const arr = this._list(key);
    const s = Number(start);
    const e = Number(stop);
    const next = arr.slice(s, e + 1);
    this.lists.set(String(key), next);
    return 'OK';
  }

  async lrange(key, start, stop) {
    const arr = this._list(key);
    const s = Number(start);
    const e = Number(stop);
    return arr.slice(s, e + 1);
  }

  async expire(key, ttlSeconds) {
    this.expires.set(String(key), Number(ttlSeconds));
    return 1;
  }

  multi() {
    const ops = [];
    const self = this;
    return {
      lpush(k, v) {
        ops.push(() => self.lpush(k, v));
        return this;
      },
      ltrim(k, s, e) {
        ops.push(() => self.ltrim(k, s, e));
        return this;
      },
      expire(k, t) {
        ops.push(() => self.expire(k, t));
        return this;
      },
      async exec() {
        const results = [];
        for (const fn of ops) {
          // ioredis multi returns [err, value] tuples
          try {
            const v = await fn();
            results.push([null, v]);
          } catch (e) {
            results.push([e, null]);
          }
        }
        return results;
      },
    };
  }
}

describe('realtime/photoEventHistory', () => {
  test('append stores per-user list with ttl and capped size', async () => {
    const redis = new MemoryRedis();
    const history = createPhotoEventHistory({ redis, ttlSeconds: 123, maxEntries: 2 });

    const userId = 'u1';
    const base = { userId, photoId: 'p', status: 'processing', updatedAt: new Date().toISOString() };

    await history.append({ ...base, eventId: 'e1' });
    await history.append({ ...base, eventId: 'e2' });
    await history.append({ ...base, eventId: 'e3' });

    const key = history.__private__.toUserKey(userId);
    const items = await redis.lrange(key, 0, 10);
    expect(items.length).toBe(2);

    // Newest first
    expect(JSON.parse(items[0]).eventId).toBe('e3');
    expect(JSON.parse(items[1]).eventId).toBe('e2');

    expect(redis.expires.get(key)).toBe(123);
  });

  test('getCatchupEvents filters by since timestamp', async () => {
    const redis = new MemoryRedis();
    const history = createPhotoEventHistory({ redis, maxEntries: 10, maxReplay: 10 });
    const userId = 'u1';

    const t1 = new Date('2025-01-01T00:00:00.000Z').toISOString();
    const t2 = new Date('2025-01-01T00:00:10.000Z').toISOString();
    const t3 = new Date('2025-01-01T00:00:20.000Z').toISOString();

    await history.append({ userId, eventId: 'e1', photoId: 'p1', status: 'processing', updatedAt: t1 });
    await history.append({ userId, eventId: 'e2', photoId: 'p1', status: 'processing', updatedAt: t2 });
    await history.append({ userId, eventId: 'e3', photoId: 'p1', status: 'processing', updatedAt: t3 });

    const sinceMs = Date.parse(t2);
    const out = await history.getCatchupEvents({ userId, since: String(sinceMs) });
    expect(out.ok).toBe(true);
    expect(out.events.map((e) => e.eventId)).toEqual(['e3']);
  });

  test('getCatchupEvents filters by since eventId', async () => {
    const redis = new MemoryRedis();
    const history = createPhotoEventHistory({ redis, maxEntries: 10, maxReplay: 10 });
    const userId = 'u1';

    await history.append({ userId, eventId: 'e1', photoId: 'p1', status: 'processing', updatedAt: '2025-01-01T00:00:00.000Z' });
    await history.append({ userId, eventId: 'e2', photoId: 'p1', status: 'processing', updatedAt: '2025-01-01T00:00:10.000Z' });
    await history.append({ userId, eventId: 'e3', photoId: 'p1', status: 'processing', updatedAt: '2025-01-01T00:00:20.000Z' });

    const out = await history.getCatchupEvents({ userId, since: 'e2' });
    expect(out.ok).toBe(true);
    expect(out.events.map((e) => e.eventId)).toEqual(['e3']);
  });
});
