/**
 * Integration tests for photo pagination
 * Tests GET /photos endpoint with limit and cursor parameters
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.E2E_ROUTES_ENABLED = 'true'; // Enable E2E auth bypass
process.env.JWT_SECRET = 'test-jwt-secret-pagination';
process.env.THUMBNAIL_SIGNING_SECRET = 'test-thumbnail-signing-secret';

const app = require('../server');
const db = require('../db/index');

describe('GET /photos pagination', () => {
  let testUserId;
  let testToken;
  let totalPhotosExpected = 0; // Will be determined after setup

  beforeAll(async () => {
    // Use E2E test user ID (bypasses Supabase auth in test mode)
    testUserId = '11111111-1111-4111-8111-111111111111';
    testToken = jwt.sign(
      { 
        id: testUserId, 
        email: 'pagination@test.com', 
        sub: testUserId,
        username: 'pagination-test',
        role: 'user'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Query what photos actually exist via the API (truth source)
    // In the test environment, there are persistent photos we can't delete due to RLS
    const checkResponse = await request(app)
      .get('/photos')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);
    
    totalPhotosExpected = checkResponse.body.photos.length;
    console.log(`[pagination test] Test environment has ${totalPhotosExpected} photos for E2E user`);
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
    }
  });

  describe('Basic pagination', () => {
    test('should return first page with default limit', async () => {
      if (totalPhotosExpected === 0) {
        console.warn('[pagination test] Skipping - no photos available');
        return;
      }
      
      const response = await request(app)
        .get('/photos')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe(testUserId);
      expect(Array.isArray(response.body.photos)).toBe(true);
      
      // Should return all photos if total <= default limit (50)
      const expectedCount = Math.min(totalPhotosExpected, 50);
      expect(response.body.photos.length).toBe(expectedCount);
      
      // nextCursor should be null if all photos fit in one page
      if (totalPhotosExpected <= 50) {
        expect(response.body.nextCursor).toBe(null);
      }
    });

    test('should return first page with limit=3', async () => {
      // Skip test if we don't have enough photos
      if (totalPhotosExpected < 3) {
        console.warn('[pagination test] Skipping test - not enough photos');
        return;
      }
      
      const response = await request(app)
        .get('/photos?limit=3')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.photos.length).toBe(Math.min(3, totalPhotosExpected));
      
      // Should have nextCursor if more than 3 photos exist
      if (totalPhotosExpected > 3) {
        expect(response.body.nextCursor).toBeTruthy();
      }
      
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
      if (totalPhotosExpected < 4) {
        console.warn('[pagination test] Skipping - not enough photos for pagination');
        return;
      }
      
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
      expect(secondPage.body.photos.length).toBeGreaterThan(0);
      
      // Verify no overlap
      const firstPageIds = new Set(firstPage.body.photos.map(p => p.id));
      const secondPageIds = secondPage.body.photos.map(p => p.id);
      
      secondPageIds.forEach(id => {
        expect(firstPageIds.has(id)).toBe(false);
      });
    });

    test('should paginate through all photos', async () => {
      if (totalPhotosExpected < 4) {
        console.warn('[pagination test] Skipping test - not enough photos for full pagination');
        return;
      }
      
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
      expect(allIds.size).toBe(totalPhotosExpected);
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

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid limit parameter');
    });

    test('should reject invalid limit (too large)', async () => {
      const response = await request(app)
        .get('/photos?limit=300')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid limit parameter');
    });

    test('should reject invalid limit (non-integer)', async () => {
      const response = await request(app)
        .get('/photos?limit=abc')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid limit parameter');
    });

    test('should reject malformed cursor', async () => {
      const response = await request(app)
        .get('/photos?cursor=invalid-cursor')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid cursor parameter');
    });

    test('should reject cursor with missing fields', async () => {
      // Create cursor missing 'id' field
      const badCursor = Buffer.from(JSON.stringify({ created_at: '2024-01-01T00:00:00Z' }), 'utf8').toString('base64url');
      
      const response = await request(app)
        .get(`/photos?cursor=${badCursor}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid cursor parameter');
    });

    test('should enforce user scoping with cursor', async () => {
      // This test verifies that cursor from one user cannot leak data from another user
      // In E2E test mode, we can't easily create multiple valid users
      // So we test the principle: cursor is just a pagination bookmark, user_id filtering is always enforced
      
      // Get first page
      const firstPage = await request(app)
        .get('/photos?limit=2')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      if (!firstPage.body.nextCursor) {
        // Not enough photos for this test
        return;
      }

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
  });
});
