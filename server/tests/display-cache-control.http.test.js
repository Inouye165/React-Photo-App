const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
const PREV_MEDIA_REDIRECT_ENABLED = process.env.MEDIA_REDIRECT_ENABLED;
process.env.MEDIA_REDIRECT_ENABLED = 'true';

jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn()
}));

jest.mock('../lib/redis', () => ({
  getRedisClient: jest.fn(() => null)
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
const { signThumbnailUrl } = require('../utils/urlSigning');

const storageApi = supabase.__mock.storageApi;

function makeTestBearerToken() {
  const { jwtSecret } = getConfig();
  return jwt.sign({ sub: 'test-user-1' }, jwtSecret);
}

function makeSignedThumbnailQuery(hash = 'testhash') {
  const { sig, exp } = signThumbnailUrl(hash, 900);
  return { sig, exp };
}

describe('Display redirect Cache-Control (HTTP regression)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storageApi.createSignedUrl.mockReset();
  });

  afterAll(() => {
    if (PREV_MEDIA_REDIRECT_ENABLED === undefined) {
      delete process.env.MEDIA_REDIRECT_ENABLED;
    } else {
      process.env.MEDIA_REDIRECT_ENABLED = PREV_MEDIA_REDIRECT_ENABLED;
    }
  });

  test('GET /display/thumbnails/:filename (signed) 302 includes private no-store Cache-Control', async () => {
    const { sig, exp } = makeSignedThumbnailQuery('testhash');

    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.invalid/signed-thumbnail-url' },
      error: null
    });

    const res = await request(app)
      .get(`/display/thumbnails/testhash.webp?sig=${encodeURIComponent(sig)}&exp=${exp}`)
      .expect(302);

    expect(storageApi.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(res.headers.location).toBe('https://example.invalid/signed-thumbnail-url');

    const cacheControl = res.headers['cache-control'];
    expect(cacheControl).toBeTruthy();

    expect(cacheControl).not.toContain('...');
    expect(cacheControl).not.toContain('…');

    expect(cacheControl).toMatch(/\bprivate\b/i);
    expect(cacheControl).toMatch(/no-store/i);
  });

  test('GET /display/thumbnails/:filename rejects invalid signature', async () => {
    const { exp } = makeSignedThumbnailQuery('testhash');

    const res = await request(app)
      .get(`/display/thumbnails/testhash.webp?sig=invalid-signature&exp=${exp}`)
      .expect(403);

    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      success: false,
      error: 'Forbidden'
    });
  });

  test('GET /display/thumbnails/:filename rejects expired signed URL', async () => {
    const { sig } = makeSignedThumbnailQuery('testhash');
    const expiredExp = Math.floor(Date.now() / 1000) - 60;

    const res = await request(app)
      .get(`/display/thumbnails/testhash.webp?sig=${encodeURIComponent(sig)}&exp=${expiredExp}`)
      .expect(403);

    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      success: false,
      error: 'Forbidden'
    });
  });

  test('GET /display/thumbnails/:filename (unsigned) rejects requests without auth', async () => {
    const res = await request(app)
      .get('/display/thumbnails/testhash.webp')
      .expect(401);

    expect(storageApi.createSignedUrl).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      success: false,
      error: 'Access token required for image access'
    });
  });

  test('GET /display/thumbnails/:filename (unsigned) 302 includes private no-store Cache-Control', async () => {
    storageApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.invalid/signed-thumbnail-url' },
      error: null
    });

    const token = makeTestBearerToken();

    const res = await request(app)
      .get('/display/thumbnails/testhash.webp')
      .set('Authorization', `Bearer ${token}`)
      .expect(302);

    expect(storageApi.createSignedUrl).toHaveBeenCalledTimes(1);
    expect(res.headers.location).toBe('https://example.invalid/signed-thumbnail-url');

    const cacheControl = res.headers['cache-control'];
    expect(cacheControl).toBeTruthy();

    expect(cacheControl).not.toContain('...');
    expect(cacheControl).not.toContain('…');

    expect(cacheControl).toMatch(/\bprivate\b/i);
    expect(cacheControl).toMatch(/no-store/i);
  });
});
