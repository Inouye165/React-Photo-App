export {};

const { invalidateAuthProfileCacheForUserId, recordAuthProfileCacheKeyForUserId, getAuthProfileInvalidatedAtMs } = require('../lib/redis');
const { __private__ } = require('../middleware/auth');

interface CacheEntryParams {
  cachedAtMs: number | undefined;
  invalidatedAtMs: number | null;
}

interface MockRedis {
  sadd: (key: string, member: string) => Promise<number>;
  smembers: (key: string) => Promise<string[]>;
  expire: () => Promise<number>;
  setex: (key: string, seconds: number, value: string) => Promise<string>;
  get: (key: string) => Promise<string | null>;
  del: (...keys: string[]) => Promise<number>;
}

describe('Auth profile cache invalidation', () => {
  test('cache entry validity respects invalidatedAt timestamp', () => {
    expect(__private__.isAuthProfileCacheEntryValid({ cachedAtMs: 1000, invalidatedAtMs: null })).toBe(true);
    expect(__private__.isAuthProfileCacheEntryValid({ cachedAtMs: 1000, invalidatedAtMs: 0 })).toBe(true);

    // If invalidation exists, only entries written strictly after invalidation are valid.
    expect(__private__.isAuthProfileCacheEntryValid({ cachedAtMs: 1000, invalidatedAtMs: 1000 })).toBe(false);
    expect(__private__.isAuthProfileCacheEntryValid({ cachedAtMs: 999, invalidatedAtMs: 1000 })).toBe(false);
    expect(__private__.isAuthProfileCacheEntryValid({ cachedAtMs: 1001, invalidatedAtMs: 1000 })).toBe(true);

    // Missing cachedAt is treated as stale under invalidation.
    expect(__private__.isAuthProfileCacheEntryValid({ cachedAtMs: undefined, invalidatedAtMs: 1000 })).toBe(false);
  });

  test('invalidateAuthProfileCacheForUserId deletes indexed keys and sets invalidatedAt', async () => {
    const kv = new Map<string, string>();
    const sets = new Map<string, Set<string>>();

    const redis: MockRedis = {
      sadd: async (key: string, member: string): Promise<number> => {
        const s = sets.get(key) || new Set<string>();
        s.add(member);
        sets.set(key, s);
        return 1;
      },
      smembers: async (key: string): Promise<string[]> => {
        const s = sets.get(key);
        return s ? Array.from(s) : [];
      },
      expire: async (): Promise<number> => 1,
      setex: async (key: string, _seconds: number, value: string): Promise<string> => {
        kv.set(key, value);
        return 'OK';
      },
      get: async (key: string): Promise<string | null> => kv.get(key) || null,
      del: async (...keys: string[]): Promise<number> => {
        let deleted = 0;
        for (const key of keys) {
          if (kv.delete(key)) deleted++;
          if (sets.delete(key)) deleted++;
        }
        return deleted;
      },
    };

    const userId: string = '11111111-1111-4111-8111-111111111111';
    const cacheKey: string = 'auth:profile:tokenhash';

    await recordAuthProfileCacheKeyForUserId(userId, cacheKey, 300, { redis });

    // Also create the actual cache entry so we can verify it is deleted.
    await redis.setex(cacheKey, 300, JSON.stringify({ id: userId, email: 'a@b.com', cachedAtMs: 1 }));

    const result = await invalidateAuthProfileCacheForUserId(userId, { redis });
    expect(result.ok).toBe(true);
    expect(result.keysDeleted).toBe(1);

    const invalidatedAtMs: number = await getAuthProfileInvalidatedAtMs(userId, { redis });
    expect(typeof invalidatedAtMs).toBe('number');
    expect(invalidatedAtMs).toBeGreaterThan(0);

    const stillThere: string | null = await redis.get(cacheKey);
    expect(stillThere).toBeNull();
  });
});
