const request = require('supertest');
const jwt = require('jsonwebtoken');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-regression';
process.env.THUMBNAIL_SIGNING_SECRET = 'test-thumbnail-signing-secret-regression';

const app = require('../server');
const db = require('../db/index');

/**
 * Regression Test for Thumbnail 401 Unauthorized Bug
 * 
 * Issue: After security refactor, thumbnail images in <img> tags
 * were failing with 401 Unauthorized because browsers don't send
 * custom Authorization headers for image requests.
 * 
 * Solution: Implement signed URLs that work without headers.
 * 
 * This test simulates the complete end-to-end flow:
 * 1. User authenticates
 * 2. User fetches list of photos
 * 3. For each photo, user obtains signed thumbnail URL
 * 4. Browser loads thumbnail using <img src="..." /> (no auth header)
 * 5. Thumbnail loads successfully (200 OK)
 */
describe('REGRESSION: Thumbnail 401 after security refactor', () => {
  let testUserId;
  let testToken;
  let testPhotos;

  beforeAll(async () => {
    // Simulate user authentication
    testUserId = 'regression-test-user-' + Date.now();
    
    testToken = jwt.sign(
      { id: testUserId, email: 'regression@example.com', sub: testUserId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create test photos (simulating uploaded photos with thumbnails)
    const photosData = [
      {
        user_id: testUserId,
        filename: 'photo1.jpg',
        state: 'inprogress',
        hash: 'regression-hash-001',
        file_size: 1024000,
        metadata: JSON.stringify({ DateTimeOriginal: '2024:01:01 12:00:00' }),
        storage_path: 'inprogress/photo1.jpg'
      },
      {
        user_id: testUserId,
        filename: 'photo2.jpg',
        state: 'inprogress',
        hash: 'regression-hash-002',
        file_size: 2048000,
        metadata: JSON.stringify({ DateTimeOriginal: '2024:01:02 14:30:00' }),
        storage_path: 'inprogress/photo2.jpg'
      }
    ];

    const insertResult = await db('photos').insert(photosData);
    
    // Handle different return values
    if (Array.isArray(insertResult) && insertResult.length > 0) {
      // Fetch the actual photos to get all fields
      testPhotos = await db('photos').where({ user_id: testUserId }).select('*');
    } else {
      testPhotos = await db('photos').where({ user_id: testUserId }).select('*');
    }
  });

  afterAll(async () => {
    // Clean up
    await db('photos').where({ user_id: testUserId }).delete();
    await db.destroy();
  });

  test('End-to-end flow: User can view photo list with thumbnails', async () => {
    // STEP 1: User is authenticated (testToken exists)
    expect(testToken).toBeTruthy();

    // STEP 2: User fetches their photos
    const photosResponse = await request(app)
      .get('/photos')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(photosResponse.body.success).toBe(true);
    expect(photosResponse.body.photos).toBeDefined();
    expect(photosResponse.body.photos.length).toBeGreaterThanOrEqual(2);

    const photos = photosResponse.body.photos;

    // STEP 3: For each photo with thumbnail, obtain signed URL
    for (const photo of photos) {
      if (photo.thumbnail && photo.id) {
        const thumbnailUrlResponse = await request(app)
          .get(`/photos/${photo.id}/thumbnail-url`)
          .set('Authorization', `Bearer ${testToken}`)
          .expect(200);

        expect(thumbnailUrlResponse.body.success).toBe(true);
        expect(thumbnailUrlResponse.body.url).toBeTruthy();

        const signedThumbnailUrl = thumbnailUrlResponse.body.url;

        // STEP 4 & 5: Simulate <img> tag request (NO Authorization header)
        // Mock Supabase storage for this test
        const supabase = require('../lib/supabaseClient');
        const mockBuffer = Buffer.from('fake-jpeg-data');
        supabase.storage.from = jest.fn().mockReturnValue({
          download: jest.fn().mockResolvedValue({
            data: new Blob([mockBuffer]),
            error: null
          })
        });

        const imageResponse = await request(app)
          .get(signedThumbnailUrl)
          // NO Authorization header - simulating browser <img> request
          .expect(200); // Should NOT return 401!

        // Verify image response
        expect(imageResponse.headers['content-type']).toBe('image/jpeg');
        expect(imageResponse.body).toBeDefined();

        // SUCCESS: Thumbnail loaded without 401 error!
      }
    }
  });

  test('Regression check: Unsigned thumbnail URLs should still require auth', async () => {
    // This ensures we didn't accidentally open up all thumbnails
    const unsignedUrl = '/display/thumbnails/regression-hash-001.jpg';

    // Attempt to access without signature and without auth
    const response = await request(app)
      .get(unsignedUrl)
      .expect(401);

    expect(response.body.error).toBe('Access token required for image access');

    // This confirms backward compatibility: old URLs require auth
  });

  test('Signed URLs should work across multiple photos', async () => {
    // Get signed URLs for all test photos
    const signedUrls = [];

    for (const photo of testPhotos) {
      const urlResponse = await request(app)
        .get(`/photos/${photo.id}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);

      signedUrls.push(urlResponse.body.url);
    }

    expect(signedUrls.length).toBe(testPhotos.length);

    // Mock Supabase storage
    const supabase = require('../lib/supabaseClient');
    const mockBuffer = Buffer.from('fake-jpeg-data');
    supabase.storage.from = jest.fn().mockReturnValue({
      download: jest.fn().mockResolvedValue({
        data: new Blob([mockBuffer]),
        error: null
      })
    });

    // All signed URLs should work without auth headers
    for (const url of signedUrls) {
      const response = await request(app)
        .get(url)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
    }
  });

  test('Simulated browser behavior: Multiple concurrent thumbnail requests', async () => {
    // Get signed URLs for all photos
    const urlPromises = testPhotos.map(photo =>
      request(app)
        .get(`/photos/${photo.id}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .then(res => res.body.url)
    );

    const signedUrls = await Promise.all(urlPromises);

    // Mock Supabase storage
    const supabase = require('../lib/supabaseClient');
    const mockBuffer = Buffer.from('fake-jpeg-data');
    supabase.storage.from = jest.fn().mockReturnValue({
      download: jest.fn().mockResolvedValue({
        data: new Blob([mockBuffer]),
        error: null
      })
    });

    // Simulate browser loading all thumbnails concurrently (like <img> tags)
    const imagePromises = signedUrls.map(url =>
      request(app)
        .get(url)
        .expect(200)
    );

    const responses = await Promise.all(imagePromises);

    // All thumbnails should load successfully
    responses.forEach(response => {
      expect(response.headers['content-type']).toBe('image/jpeg');
    });

    // No 401 errors!
  });

  test('Performance: Thumbnail URLs should be fast to generate', async () => {
    const iterations = 10;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await request(app)
        .get(`/photos/${testPhotos[0].id}/thumbnail-url`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
    }

    const endTime = Date.now();
    const avgTime = (endTime - startTime) / iterations;

    // Each request should take less than 100ms on average
    expect(avgTime).toBeLessThan(100);
  });
});
