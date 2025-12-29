/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

const { setRedisValueWithTtl } = require('../lib/redis');

describe('Redis TTL wrapper', () => {
  test('uses node-redis v4-style set(key, value, { EX }) when available', async () => {
    const calls = [];
    const client = {
      set: async (...args) => {
        calls.push(args);
        return 'OK';
      }
    };

    await expect(setRedisValueWithTtl(client, 'k', 10, 'v')).resolves.toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe('k');
    expect(calls[0][1]).toBe('v');
    expect(calls[0][2]).toEqual({ EX: 10 });
  });

  test('falls back to ioredis set(key, value, "EX", seconds) when options object is rejected', async () => {
    const calls = [];
    const client = {
      set: async (...args) => {
        calls.push(args);
        // Simulate a client that rejects the options-object signature.
        if (args.length === 3 && args[2] && typeof args[2] === 'object') {
          throw new Error('unsupported signature');
        }
        return 'OK';
      }
    };

    await expect(setRedisValueWithTtl(client, 'k', 10, 'v')).resolves.toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[0][2]).toEqual({ EX: 10 });
    expect(calls[1]).toEqual(['k', 'v', 'EX', 10]);
  });

  test('uses setex when present (ioredis compatibility)', async () => {
    const calls = [];
    const client = {
      setex: async (...args) => {
        calls.push(args);
        return 'OK';
      }
    };

    await expect(setRedisValueWithTtl(client, 'k', 10, 'v')).resolves.toBe(true);
    expect(calls[0]).toEqual(['k', 10, 'v']);
  });
});
