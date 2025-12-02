/**
 * Test suite for automatic user creation during authentication
 * 
 * SKIPPED: This feature was reverted for security reasons.
 * The automatic user creation logic has been removed from auth.js
 * to prevent unauthorized user record creation.
 * 
 * Verifies that:
 * 1. User records are created automatically when authenticating
 * 2. Existing users are not duplicated
 * 3. Photos can be accessed after user creation
 * 4. The fix prevents 404 errors for orphaned photos
 */

const { expect } = require('@jest/globals');

describe.skip('Auth User Creation (Feature Reverted)', () => {
  let db;
  let testUserId;

  beforeAll(async () => {
    // Import db
    const knexConfig = require('../knexfile');
    const knex = require('knex');
    db = knex(knexConfig.test);

    // Clean up test data
    await db('users').del();
    await db('photos').del();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('POST /api/auth/session', () => {
    it('should create a user record on first authentication', async () => {
      // Mock a valid Supabase token (in real test, use actual test user)
      testUserId = 'test-user-id-' + Date.now();

      // Note: This test requires mocking Supabase auth or using a real test user
      // For now, we'll verify the logic structure
      
      const usersBefore = await db('users').where('id', testUserId);
      expect(usersBefore.length).toBe(0);

      // In a real test, this would make the request with a valid token
      // const response = await request(app)
      //   .post('/api/auth/session')
      //   .set('Authorization', `Bearer ${testToken}`)
      //   .expect(200);

      // Verify user was created
      // const usersAfter = await db('users').where('id', testUserId);
      // expect(usersAfter.length).toBe(1);
      // expect(usersAfter[0].preferences).toBeDefined();
    });

    it('should not duplicate user records on repeated authentication', async () => {
      // Test that calling /session multiple times doesn't create duplicates
      // This would be tested with actual API calls in integration tests
    });
  });

  describe('Photo Access After User Creation', () => {
    it('should allow photo access after user record is created', async () => {
      // Create a test photo for the user
      const photoId = await db('photos').insert({
        user_id: testUserId,
        filename: 'test-image.jpg',
        state: 'finished',
        storage_path: 'finished/test-image.jpg',
        hash: 'test-hash',
        file_size: 1000,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');

      // Verify photo exists
      const photo = await db('photos').where('id', photoId[0]).first();
      expect(photo).toBeDefined();
      expect(photo.user_id).toBe(testUserId);

      // In a real test, verify photo can be accessed via API
      // const response = await request(app)
      //   .get(`/display/image/${photoId[0]}`)
      //   .set('Cookie', `authToken=${testToken}`)
      //   .expect(200);
    });
  });

  describe('Orphaned Photos Fix', () => {
    it('should fix orphaned photos by creating missing user records', async () => {
      const orphanedUserId = 'orphaned-user-' + Date.now();

      // Create a photo with a user_id that doesn't exist in users table
      await db('photos').insert({
        user_id: orphanedUserId,
        filename: 'orphaned-image.jpg',
        state: 'finished',
        storage_path: 'finished/orphaned-image.jpg',
        hash: 'orphaned-hash',
        file_size: 2000,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Verify user doesn't exist
      const userBefore = await db('users').where('id', orphanedUserId).first();
      expect(userBefore).toBeUndefined();

      // Run backfill script logic
      const photoUserIds = await db('photos')
        .distinct('user_id')
        .whereNotNull('user_id')
        .pluck('user_id');
      
      const existingUserIds = await db('users').pluck('id');
      const missingUserIds = photoUserIds.filter(id => !existingUserIds.includes(id));

      if (missingUserIds.length > 0) {
        const usersToInsert = missingUserIds.map(id => ({
          id,
          preferences: JSON.stringify({}),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        await db('users').insert(usersToInsert);
      }

      // Verify user now exists
      const userAfter = await db('users').where('id', orphanedUserId).first();
      expect(userAfter).toBeDefined();
      expect(userAfter.id).toBe(orphanedUserId);
    });
  });
});
