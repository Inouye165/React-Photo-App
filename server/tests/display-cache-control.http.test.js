const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn()
}));

jest.mock('../lib/redis', () => ({
  getRedisClient: jest.fn(() => null)
}));

jest.mock('../utils/urlSigning', () => ({
  verifyThumbnailSignature: jest.fn(() => ({ valid: true }))
}));

jest.mock('../lib/supabaseClient', () => {
  const mockStorageApi = {
    createSignedUrl: jest.fn(),
    download: jest.fn()
  };

  return {
    storage: {
      from: jest.fn(() => mockStorageApi)
    },
    from: jest.fn(),
    __mock: {
      storageApi: mockStorageApi
    }
  };
});

const app = require('../server');
const supabase = require('../lib/supabaseClient');
const { getConfig } = require('../config/env');

const storageApi = supabase.__mock.storageApi;

function parseMaxAge(cacheControl) {
  const match = String(cacheControl || '').match(/(?:^|,\s*)max-age=(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function makeTestBearerToken() {
  const { jwtSecret } = getConfig();
  return jwt.sign({ sub: 'test-user-1' }, jwtSecret);
}

describe('Display redirect Cache-Control (HTTP regression)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storageApi.createSignedUrl.mockReset();
  });

  test('GET /display/thumbnails/:filename (signed) 302 includes valid public Cache-Control with max-age', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;

    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.invalid/signed-thumbnail-url' },
      error: null
    });

    const res = await request(app)
      .get(`/display/thumbnails/testhash.jpg?sig=fake&exp=${exp}`)
      .expect(302);

    expect(storageApi.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(res.headers.location).toBe('https://example.invalid/signed-thumbnail-url');

    const cacheControl = res.headers['cache-control'];
    expect(cacheControl).toBeTruthy();

    expect(cacheControl).not.toContain('...');
    expect(cacheControl).not.toContain('…');

    expect(cacheControl).toMatch(/\bpublic\b/i);

    const maxAge = parseMaxAge(cacheControl);
    expect(maxAge).not.toBeNull();
    expect(maxAge).toBeGreaterThan(0);
  });

  test('GET /display/thumbnails/:filename (unsigned) 302 includes valid private Cache-Control with max-age', async () => {
    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.invalid/signed-thumbnail-url' },
      error: null
    });

    const token = makeTestBearerToken();

    const res = await request(app)
      .get('/display/thumbnails/testhash.jpg')
      .set('Authorization', `Bearer ${token}`)
      .expect(302);

    expect(storageApi.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(res.headers.location).toBe('https://example.invalid/signed-thumbnail-url');

    const cacheControl = res.headers['cache-control'];
    expect(cacheControl).toBeTruthy();

    expect(cacheControl).not.toContain('...');
    expect(cacheControl).not.toContain('…');

    expect(cacheControl).toMatch(/\bprivate\b/i);

    const maxAge = parseMaxAge(cacheControl);
    expect(maxAge).not.toBeNull();
    expect(maxAge).toBeGreaterThan(0);
  });
});
