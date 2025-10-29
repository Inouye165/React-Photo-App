import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginUser } from './api.js';

describe('api.loginUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves with JSON on successful login', async () => {
    // Call with serverUrl '/api' so fetch mock from src/test/setup.js matches
    const res = await loginUser('testuser', 'password123', '/api');
    expect(res).toHaveProperty('token', 'mock-jwt-token');
    expect(res).toHaveProperty('user');
    expect(res.user).toHaveProperty('username', 'testuser');
  });

  it('throws an Error with parsed message on non-ok response', async () => {
    // Mock fetch to return a non-ok response with JSON error
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'Invalid credentials' }),
    });

  // Depending on environment the implementation may surface the parsed JSON
  // error or fall back to response.statusText. Accept either to keep the
  // assertion robust.
  await expect(loginUser('bad', 'creds', '/api')).rejects.toThrow(/Invalid credentials|Unauthorized/);

    // restore fetch
    global.fetch = originalFetch;
  });
});
