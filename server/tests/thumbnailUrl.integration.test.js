const request = require('supertest');
const jwt = require('jsonwebtoken');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-thumbnail-integration';
process.env.THUMBNAIL_SIGNING_SECRET = 'test-thumbnail-signing-secret';
const PREV_MEDIA_REDIRECT_ENABLED = process.env.MEDIA_REDIRECT_ENABLED;
process.env.MEDIA_REDIRECT_ENABLED = 'true';

const app = require('../server');
const db = require('../db/index');

describe('Thumbnail URL API - Integration Tests', () => {
  let testUserId;
  let testToken;
  let testPhotoId;
  let testPhotoHash;

  beforeAll(() => {
    // Supabase auth is mocked in tests to return user id=1.
    testUserId = 1;
    testToken = jwt.sign(
      { id: testUserId, email: 'test@example.com', sub: String(testUserId) },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  beforeEach(async () => {
    // Global test setup clears and reloads the mock DB before each test,
    // so we must insert our fixtures after that.
    const insertResult = await db('photos').insert({
      user_id: testUserId,
      filename: 'test-photo.jpg',
      state: 'inprogress',
      hash: 'abc123def456',
      file_size: 1024000,
      metadata: JSON.stringify({ test: true }),
      storage_path: 'inprogress/test-photo.jpg',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (Array.isArray(insertResult) && insertResult.length > 0) {
      testPhotoId = typeof insertResult[0] === 'object' ? insertResult[0].id : insertResult[0];
    } else {
      testPhotoId = insertResult;
    }

    const photo = await db('photos').where({ id: testPhotoId }).first();
    testPhotoHash = photo?.hash;
  });

  afterEach(async () => {
    if (testPhotoId != null) {
      await db('photos').where({ id: testPhotoId }).delete();
    }
  });

  afterAll(async () => {
    await db.destroy();
    if (PREV_MEDIA_REDIRECT_ENABLED === undefined) {
      delete process.env.MEDIA_REDIRECT_ENABLED;
    } else {
      process.env.MEDIA_REDIRECT_ENABLED = PREV_MEDIA_REDIRECT_ENABLED;
    }
  });

  describe('GET /photos/:id/thumbnail-url', () => {
    test('should return signed URL for authorized user', async () => {
      const response = await request(app)
        .get(`/photos/${testPhotoId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasThumbnail).toBe(true);
      expect(response.body.url).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();

      // URL should contain hash (or part of it), sig, and exp parameters
      // Note: Database may truncate hash, so check for the beginning
      expect(response.body.url).toMatch(/\/display\/thumbnails\/[a-z0-9]+\.jpg\?sig=.*&exp=\d+/);
      expect(response.body.url).toContain('sig=');
      expect(response.body.url).toContain('exp=');

      // Expiration should be in the future
      const now = Math.floor(Date.now() / 1000);
      expect(response.body.expiresAt).toBeGreaterThan(now);
    });

    test('should reject request without authentication', async () => {
      const response = await request(app)
        .get(`/photos/${testPhotoId}/thumbnail-url`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authorization header with Bearer token required');
    });

    test('should reject request for non-existent photo', async () => {
      const fakePhotoId = 99999999;

      const response = await request(app)
        .get(`/photos/${fakePhotoId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Photo not found');
    });

    test('should reject request for photo owned by different user', async () => {
      // Create photo owned by different user
      const otherUserId = 'other-user-' + Date.now();
      const insertResult = await db('photos').insert({
        user_id: otherUserId,
        filename: 'other-photo.jpg',
        state: 'inprogress',
        hash: 'xyz789abc123',
        file_size: 2048000,
        metadata: JSON.stringify({ test: true }),
        storage_path: 'inprogress/other-photo.jpg',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const otherPhotoId = Array.isArray(insertResult) && insertResult.length > 0
        ? (typeof insertResult[0] === 'object' ? insertResult[0].id : insertResult[0])
        : insertResult;

      const response = await request(app)
        .get(`/photos/${otherPhotoId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Photo not found');

      // Clean up
      await db('photos').where({ id: otherPhotoId }).delete();
    });

    test('should return 200 with hasThumbnail:false for photo without hash', async () => {
      // Create photo without hash (thumbnail not generated yet)
      const insertResult = await db('photos').insert({
        user_id: testUserId,
        filename: 'no-hash-photo.jpg',
        state: 'working',
        hash: null,
        file_size: 512000,
        metadata: JSON.stringify({ test: true }),
        storage_path: 'working/no-hash-photo.jpg',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const photoWithoutHashId = Array.isArray(insertResult) && insertResult.length > 0
        ? (typeof insertResult[0] === 'object' ? insertResult[0].id : insertResult[0])
        : insertResult;

      const response = await request(app)
        .get(`/photos/${photoWithoutHashId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasThumbnail).toBe(false);
      expect(response.body.url).toBe(null);
      expect(response.body.expiresAt).toBe(null);

      // Clean up
      await db('photos').where({ id: photoWithoutHashId }).delete();
    });

    test('generated URL should be valid and contain proper components', async () => {
      const response = await request(app)
        .get(`/photos/${testPhotoId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasThumbnail).toBe(true);
      
      const url = response.body.url;

      // Parse URL
      expect(url).toMatch(/^\/display\/thumbnails\//);
      expect(url).toContain(`.jpg`);

      // Extract query parameters
      const urlObj = new URL(url, 'http://localhost');
      const sig = urlObj.searchParams.get('sig');
      const exp = urlObj.searchParams.get('exp');

      expect(sig).toBeTruthy();
      expect(sig.length).toBeGreaterThan(20);
      expect(exp).toBeTruthy();
      expect(Number(exp)).toBeGreaterThan(0);
    });

    test('should generate stable signatures within same time window', async () => {
      // With 24-hour time windows, signatures should be identical within the same day
      const response1 = await request(app)
        .get(`/photos/${testPhotoId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 1100));

      const response2 = await request(app)
        .get(`/photos/${testPhotoId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      // URLs should be identical (same signatures and expirations within time window)
      expect(response1.body.url).toBe(response2.body.url);
      expect(response1.body.expiresAt).toBe(response2.body.expiresAt);
    });
  });

  describe('GET /photos list includes signed thumbnails', () => {
    test('should include signed thumbnail URLs in list response', async () => {
      const response = await request(app)
        .get('/photos')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.photos)).toBe(true);

      const listed = response.body.photos.find((p) => p && p.id === testPhotoId);
      expect(listed).toBeTruthy();
      expect(listed.thumbnail).toMatch(/\/display\/thumbnails\/[a-z0-9]+\.jpg\?sig=.*&exp=\d+/);
      expect(listed.thumbnailUrl).toMatch(/\/display\/thumbnails\/[a-z0-9]+\.jpg\?sig=.*&exp=\d+/);
      expect(listed.smallThumbnailUrl || listed.smallThumbnail).toMatch(/\/display\/thumbnails\/[a-z0-9]+\.jpg\?sig=.*&exp=\d+/);
      if (listed.smallThumbnailUrl) {
        expect(listed.smallThumbnailUrl).toBe(listed.thumbnailUrl);
      }
    });
  });

  describe('Signed URL validation in /display/thumbnails', () => {
    test('should serve thumbnail with valid signed URL', async () => {
      // Get signed URL
      const urlResponse = await request(app)
        .get(`/photos/${testPhotoId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      const signedUrl = urlResponse.body.url;

      // Mock Supabase signed URL response (redirect target)
      const supabase = require('../lib/supabaseClient');
      const storageApi = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/photos/thumbnails/abc123.jpg?token=fake' },
          error: null
        }),
        download: jest.fn()
      };
      supabase.storage.from = jest.fn().mockReturnValue(storageApi);

      // Request thumbnail using signed URL (no auth header needed)
      const imageResponse = await request(app)
        .get(signedUrl)
        .expect(302);

      expect(imageResponse.headers.location).toBeTruthy();
      expect(imageResponse.headers.location).toMatch(/\/storage\/v1\/object\/sign\//);
      expect(imageResponse.headers['cache-control']).toContain('private');
      expect(imageResponse.headers['cache-control']).toContain('no-store');

      expect(storageApi.download).not.toHaveBeenCalled();
    });

    test('should reject expired signed URL', async () => {
      // Create URL that expired 100 seconds ago
      const pastExp = Math.floor(Date.now() / 1000) - 100;
      const crypto = require('crypto');
      const SECRET = process.env.THUMBNAIL_SIGNING_SECRET;
      const message = `thumbnails/${testPhotoHash}.jpg:${pastExp}`;
      const sig = crypto.createHmac('sha256', SECRET).update(message).digest('base64url');

      const expiredUrl = `/display/thumbnails/${testPhotoHash}.jpg?sig=${encodeURIComponent(sig)}&exp=${pastExp}`;

      const response = await request(app)
        .get(expiredUrl)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('should reject tampered signed URL', async () => {
      // Get valid signed URL
      const urlResponse = await request(app)
        .get(`/photos/${testPhotoId}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      const originalUrl = urlResponse.body.url;

      // Tamper with the hash in the URL path by replacing any hash pattern with 'tampered123'
      const tamperedUrl = originalUrl.replace(/\/thumbnails\/[a-z0-9]+\.jpg/, '/thumbnails/tampered123.jpg');

      const response = await request(app)
        .get(tamperedUrl)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });

    test('should reject request with missing signature', async () => {
      const url = `/display/thumbnails/${testPhotoHash}.jpg`;

      // Without signature, should fall back to cookie/token auth and fail
      const response = await request(app)
        .get(url)
        .expect(401);

      expect(response.body.error).toBe('Access token required for image access');
    });

    test('should reject request with invalid signature format', async () => {
      const exp = Math.floor(Date.now() / 1000) + 900;
      const url = `/display/thumbnails/${testPhotoHash}.jpg?sig=invalid-sig&exp=${exp}`;

      const response = await request(app)
        .get(url)
        .expect(403);

      expect(response.body.error).toBe('Forbidden');
    });
  });

  describe('Backward compatibility with cookie auth', () => {
    test('should still accept thumbnail requests with auth cookie (legacy)', async () => {
      // Mock cookie-based auth
      const mockCookie = `authToken=${testToken}`;

      // Mock Supabase signed URL response (redirect target)
      const supabase = require('../lib/supabaseClient');
      supabase.storage.from = jest.fn().mockReturnValue({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/photos/thumbnails/legacy.jpg?token=fake' },
          error: null
        }),
        download: jest.fn()
      });

      // Request thumbnail without signature but with cookie
      const response = await request(app)
        .get(`/display/thumbnails/${testPhotoHash}.jpg`)
        .set('Cookie', [mockCookie])
        .expect(302);

      expect(response.headers.location).toBeTruthy();
      expect(response.headers.location).toMatch(/\/storage\/v1\/object\/sign\//);
    });

    test('should still accept thumbnail requests with Bearer token (legacy)', async () => {
      // Mock Supabase signed URL response (redirect target)
      const supabase = require('../lib/supabaseClient');
      supabase.storage.from = jest.fn().mockReturnValue({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/photos/thumbnails/legacy2.jpg?token=fake' },
          error: null
        }),
        download: jest.fn()
      });

      // Request thumbnail without signature but with Authorization header
      const response = await request(app)
        .get(`/display/thumbnails/${testPhotoHash}.jpg`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(302);

      expect(response.headers.location).toBeTruthy();
      expect(response.headers.location).toMatch(/\/storage\/v1\/object\/sign\//);
    });
  });
});
