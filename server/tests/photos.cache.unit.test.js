/* eslint-env jest */

const createPhotosDb = require('../services/photosDb');

describe('photosDb list cache key generation', () => {
  test('builds keys as photos:list:{userId}:{cursor}:{limit}', () => {
    // Use a syntactically valid UUID (v4 + RFC4122 variant) so the cache key can preserve it.
    const userId = '00000000-0000-4000-8000-000000000000';
    const key = createPhotosDb._private.buildPhotosListCacheKey({
      userId,
      state: undefined,
      cursor: null,
      limit: 20,
    });

    expect(key.startsWith(`photos:list:${userId}:`)).toBe(true);
    expect(key.endsWith(':20')).toBe(true);

    const parts = key.split(':');
    expect(parts.length).toBe(5);
    expect(parts[0]).toBe('photos');
    expect(parts[1]).toBe('list');
    expect(parts[2]).toBe(userId);
    // Cursor is a hashed token; should not contain raw user input
    expect(parts[3].startsWith('c_')).toBe(true);
  });

  test('state and cursor influence the key (no collisions)', () => {
    const userId = '00000000-0000-4000-8000-000000000000';
    const base = createPhotosDb._private.buildPhotosListCacheKey({
      userId,
      state: undefined,
      cursor: null,
      limit: 20,
    });

    const withCursor = createPhotosDb._private.buildPhotosListCacheKey({
      userId,
      state: undefined,
      cursor: { created_at: '2026-01-01T00:00:00.000Z', id: 123 },
      limit: 20,
    });

    const withState = createPhotosDb._private.buildPhotosListCacheKey({
      userId,
      state: 'finished',
      cursor: null,
      limit: 20,
    });

    expect(withCursor).not.toBe(base);
    expect(withState).not.toBe(base);
  });
});
