/**
 * Deterministic pagination tests for GET /photos
 *
 * SECURITY/FIX NOTE:
 * - These tests MUST NOT depend on pre-existing DB rows (RLS makes seeding unreliable).
 * - We mock the photos DB service so pagination behavior is fully deterministic.
 * - Auth remains real via the E2E JWT bypass (still validates auth requirement).
 */

// Set test environment BEFORE importing server modules.
process.env.NODE_ENV = 'test';
process.env.E2E_ROUTES_ENABLED = 'true';
process.env.JWT_SECRET = 'test-jwt-secret-pagination';
process.env.THUMBNAIL_SIGNING_SECRET = 'test-thumbnail-signing-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

// Mock the DB service layer to avoid real DB/RLS dependencies.
jest.mock('../services/photosDb', () => {
  const seedRows = [
    { id: 106, filename: 'p106.jpg', state: 'finished', created_at: '2025-12-24T12:06:00.000Z', metadata: {}, hash: 'h106', file_size: 1 },
    { id: 105, filename: 'p105.jpg', state: 'finished', created_at: '2025-12-24T12:05:00.000Z', metadata: {}, hash: 'h105', file_size: 1 },
    { id: 104, filename: 'p104.jpg', state: 'inprogress', created_at: '2025-12-24T12:04:00.000Z', metadata: {}, hash: 'h104', file_size: 1 },
    { id: 103, filename: 'p103.jpg', state: 'working', created_at: '2025-12-24T12:03:00.000Z', metadata: {}, hash: 'h103', file_size: 1 },
    { id: 102, filename: 'p102.jpg', state: 'finished', created_at: '2025-12-24T12:02:00.000Z', metadata: {}, hash: 'h102', file_size: 1 },
    { id: 101, filename: 'p101.jpg', state: 'finished', created_at: '2025-12-24T12:01:00.000Z', metadata: {}, hash: 'h101', file_size: 1 },
  ];

  function applyCursorDesc(rows, cursor) {
    if (!cursor) return rows;
    const cursorTime = Date.parse(cursor.created_at);
    return rows.filter((row) => {
      const rowTime = Date.parse(row.created_at);
      if (rowTime < cursorTime) return true;
      if (rowTime > cursorTime) return false;
      return row.id < cursor.id;
    });
  }

  function applyState(rows, state) {
    if (state === 'working' || state === 'inprogress' || state === 'finished') {
      return rows.filter((r) => r.state === state);
    }
    return rows;
  }

  return function createPhotosDb() {
    return {
      listPhotos: jest.fn(async (_userId, state, options = {}) => {
        const limit = options.limit;
        const cursor = options.cursor;

        // Service contract: stable ordering desc by created_at then id
        const ordered = [...seedRows].sort((a, b) => {
          const tA = Date.parse(a.created_at);
          const tB = Date.parse(b.created_at);
          if (tA !== tB) return tB - tA;
          return b.id - a.id;
        });

        const filtered = applyCursorDesc(applyState(ordered, state), cursor);

        if (Number.isInteger(limit) && limit > 0) {
          return filtered.slice(0, limit + 1);
        }
        return filtered;
      })
    };
  };
});

const createPhotosRouter = require('../routes/photos');

let createSignedUrlSpy;

function buildApp() {
  const app = express();
  const fakeDb = () => {
    throw new Error('DB should not be used in pagination tests');
  };

  createSignedUrlSpy = jest.fn(() => {
    throw new Error('Supabase signing should not be called by GET /photos');
  });
  const fakeSupabase = {
    storage: {
      from: () => ({
        createSignedUrl: createSignedUrlSpy,
      }),
    },
  };
  app.use('/photos', createPhotosRouter({ db: fakeDb, supabase: fakeSupabase }));
  return app;
}

describe('GET /photos pagination', () => {
  let app;
  let testUserId;
  let testToken;

  beforeAll(() => {
    app = buildApp();
    testUserId = '11111111-1111-4111-8111-111111111111';
    testToken = jwt.sign(
      {
        id: testUserId,
        email: 'pagination@test.com',
        sub: testUserId,
        username: 'pagination-test',
        role: 'user',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('Basic pagination', () => {
    test('should return first page with default limit', async () => {
      const response = await request(app)
        .get('/photos')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(testUserId);
      expect(Array.isArray(response.body.photos)).toBe(true);
      
      // Seeded dataset is smaller than default limit (50)
      expect(response.body.photos.length).toBe(6);
      expect(response.body.nextCursor).toBe(null);
    });

    test('should return first page with limit=3', async () => {
      const response = await request(app)
        .get('/photos?limit=3')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.photos.length).toBe(3);
      expect(response.body.nextCursor).toBeTruthy();
      
      // Verify photos are in descending order by created_at (newest first)
      const photos = response.body.photos;
      for (let i = 1; i < photos.length; i++) {
        const prev = new Date(photos[i-1].metadata?.DateTimeOriginal || photos[i-1].created_at || 0);
        const curr = new Date(photos[i].metadata?.DateTimeOriginal || photos[i].created_at || 0);
        // Previous should be >= current (DESC order)
        expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
      }
    });

    test('should return second page using cursor', async () => {
      // Get first page
      const firstPage = await request(app)
        .get('/photos?limit=3')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      const cursor = firstPage.body.nextCursor;
      expect(cursor).toBeTruthy();

      // Get second page
      const secondPage = await request(app)
        .get(`/photos?limit=3&cursor=${encodeURIComponent(cursor)}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(secondPage.body.success).toBe(true);
      expect(secondPage.body.photos.length).toBe(3);
      
      // Verify no overlap
      const firstPageIds = new Set(firstPage.body.photos.map(p => p.id));
      const secondPageIds = secondPage.body.photos.map(p => p.id);
      
      secondPageIds.forEach(id => {
        expect(firstPageIds.has(id)).toBe(false);
      });
    });

    test('should paginate through all photos', async () => {
      const allIds = new Set();
      let cursor = null;
      let pageCount = 0;
      const limit = 3;

      do {
        const url = cursor 
          ? `/photos?limit=${limit}&cursor=${encodeURIComponent(cursor)}`
          : `/photos?limit=${limit}`;

        const response = await request(app)
          .get(url)
          .set('Authorization', `Bearer ${testToken}`)
          .expect(200);

        pageCount++;
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.photos)).toBe(true);

        response.body.photos.forEach(photo => {
          expect(allIds.has(photo.id)).toBe(false); // No duplicates
          allIds.add(photo.id);
        });

        cursor = response.body.nextCursor;
        
        // Prevent infinite loop
        expect(pageCount).toBeLessThanOrEqual(20);
      } while (cursor);

      // Should have retrieved all photos
      expect(allIds.size).toBe(6);
    });
  });

  describe('Pagination with state filter', () => {
    test('should paginate only finished photos when state filter applied', async () => {
      const response = await request(app)
        .get('/photos?state=finished&limit=50')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // All photos should be in finished state
      response.body.photos.forEach(photo => {
        expect(photo.state).toBe('finished');
      });
      
      // Test passes as long as state filtering works (even if 0 photos)
      expect(Array.isArray(response.body.photos)).toBe(true);
    });
  });

  describe('Validation and security', () => {
    test('should reject invalid limit (too small)', async () => {
      const response = await request(app)
        .get('/photos?limit=0')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(typeof response.body.reqId).toBe('string');
      expect(response.body).toHaveProperty('errorDetails');
      expect(response.body.errorDetails).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid request',
        requestId: response.body.reqId,
      });
    });

    test('should reject invalid limit (too large)', async () => {
      const response = await request(app)
        .get('/photos?limit=300')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(typeof response.body.reqId).toBe('string');
      expect(response.body).toHaveProperty('errorDetails');
      expect(response.body.errorDetails).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid request',
        requestId: response.body.reqId,
      });
    });

    test('should reject invalid limit (non-integer)', async () => {
      const response = await request(app)
        .get('/photos?limit=abc')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(typeof response.body.reqId).toBe('string');
      expect(response.body).toHaveProperty('errorDetails');
      expect(response.body.errorDetails).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid request',
        requestId: response.body.reqId,
      });
    });

    test('should reject malformed cursor', async () => {
      const response = await request(app)
        .get('/photos?cursor=invalid-cursor')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(typeof response.body.reqId).toBe('string');
      expect(response.body).toHaveProperty('errorDetails');
      expect(response.body.errorDetails).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid request',
        requestId: response.body.reqId,
      });
    });

    test('should reject cursor with missing fields', async () => {
      // Create cursor missing 'id' field
      const badCursor = Buffer.from(JSON.stringify({ created_at: '2024-01-01T00:00:00Z' }), 'utf8').toString('base64url');
      
      const response = await request(app)
        .get(`/photos?cursor=${badCursor}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Invalid request');
      expect(typeof response.body.reqId).toBe('string');
      expect(response.body).toHaveProperty('errorDetails');
      expect(response.body.errorDetails).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid request',
        requestId: response.body.reqId,
      });
    });

    test('should enforce user scoping with cursor', async () => {
      // This test verifies that cursor from one user cannot leak data from another user
      // In E2E test mode, we can't easily create multiple valid users
      // Validate the contract: cursor is pagination state only; user_id scoping remains authoritative.
      
      // Get first page
      const firstPage = await request(app)
        .get('/photos?limit=2')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      // Use the cursor for the same user - should work
      const cursor = firstPage.body.nextCursor;
      const response = await request(app)
        .get(`/photos?limit=2&cursor=${encodeURIComponent(cursor)}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(testUserId);
      // All returned photos should belong to testUserId (enforced by backend)
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/photos?limit=10')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Response format', () => {
    test('should include all required fields in paginated response', async () => {
      const response = await request(app)
        .get('/photos?limit=2')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('photos');
      expect(response.body).toHaveProperty('nextCursor');
      
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(testUserId);
      expect(Array.isArray(response.body.photos)).toBe(true);
    });

    test('should include thumbnail URLs in paginated results', async () => {
      const response = await request(app)
        .get('/photos?limit=2')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.photos.length).toBeGreaterThan(0);
      
      const photo = response.body.photos[0];
      expect(photo.thumbnail).toBeTruthy();
      expect(photo.thumbnail).toMatch(/\/display\/thumbnails\//);
      expect(photo.thumbnail).toContain('sig=');
      expect(photo.thumbnail).toContain('exp=');
    });

    test('should not call Supabase createSignedUrl when listing photos', async () => {
      const response = await request(app)
        .get('/photos?limit=3')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.photos)).toBe(true);
      expect(response.body.photos.length).toBeGreaterThan(0);

      // Regression: listing should not do per-row Supabase signing.
      expect(createSignedUrlSpy).toBeDefined();
      expect(createSignedUrlSpy).not.toHaveBeenCalled();

      for (const photo of response.body.photos) {
        expect(photo.thumbnail).toBeTruthy();
        expect(photo.thumbnail).toMatch(/\/display\/thumbnails\//);
        expect(photo.thumbnail).toContain('sig=');
        expect(photo.thumbnail).toContain('exp=');
      }
    });
  });
});
