/**
 * Privilege Ownership Tests
 * 
 * Tests the /privilege endpoint to ensure proper ownership-based access control.
 * These tests verify that the endpoint performs real-time database lookups to
 * determine file ownership and returns appropriate permissions.
 */
const request = require('supertest');
const express = require('express');
const createPrivilegeRouter = require('../routes/privilege');
const db = require('../db/index');
const { mockDbHelpers } = require('./setup');

// Import mocked supabase to configure auth responses
const supabase = require('../lib/supabaseClient');

let app;
let ownerToken = 'owner-token';
let nonOwnerToken = 'non-owner-token';
const ownerId = 'owner-uuid-123';
const nonOwnerId = 'non-owner-uuid-456';

beforeEach(() => {
  app = express();
  app.use(express.json());

  // Mock authentication middleware to simulate different users
  supabase.auth.getUser.mockReset();
  supabase.auth.getUser.mockImplementation(async (token) => {
    if (token === ownerToken) {
      return { 
        data: { 
          user: { 
            id: ownerId,
            email: 'owner@example.com',
            user_metadata: { username: 'owner' },
            app_metadata: { role: 'user' }
          } 
        }, 
        error: null 
      };
    } else if (token === nonOwnerToken) {
      return { 
        data: { 
          user: { 
            id: nonOwnerId,
            email: 'nonowner@example.com',
            user_metadata: { username: 'nonowner' },
            app_metadata: { role: 'user' }
          } 
        }, 
        error: null 
      };
    }
    return { data: { user: null }, error: { message: 'Invalid token' } };
  });

  // Simple auth middleware that sets req.user based on token
  const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      username: user.user_metadata?.username || user.email.split('@')[0],
      role: user.app_metadata?.role || 'user'
    };

    next();
  };

  app.use(authMiddleware);
  app.use(createPrivilegeRouter({ db }));
});

describe('Privilege Endpoint - Ownership Checks', () => {
  describe('Owner Permissions (RWX)', () => {
    test('Owner receives RWX permissions for their own photo', async () => {
      // Seed a photo belonging to the owner
      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'owner-photo.jpg',
        state: 'working',
        storage_path: 'working/owner-photo.jpg',
        hash: 'owner-hash-1'
      });

      // Request privilege check as the owner
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filenames: ['owner-photo.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges).toBeDefined();
      expect(res.body.privileges['owner-photo.jpg']).toBe('RWX');
    });

    test('Owner receives RWX for multiple owned photos', async () => {
      // Seed multiple photos belonging to the owner
      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'owner-photo-1.jpg',
        state: 'working',
        storage_path: 'working/owner-photo-1.jpg',
        hash: 'owner-hash-1'
      });

      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'owner-photo-2.jpg',
        state: 'working',
        storage_path: 'working/owner-photo-2.jpg',
        hash: 'owner-hash-2'
      });

      // Request privilege check for both photos
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filenames: ['owner-photo-1.jpg', 'owner-photo-2.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges['owner-photo-1.jpg']).toBe('RWX');
      expect(res.body.privileges['owner-photo-2.jpg']).toBe('RWX');
    });
  });

  describe('Non-Owner Permissions (R only)', () => {
    test('Non-owner receives R permissions only for other user photo', async () => {
      // Seed a photo belonging to the owner
      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'owner-photo.jpg',
        state: 'working',
        storage_path: 'working/owner-photo.jpg',
        hash: 'owner-hash-1'
      });

      // Request privilege check as non-owner
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${nonOwnerToken}`)
        .send({ filenames: ['owner-photo.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges).toBeDefined();
      expect(res.body.privileges['owner-photo.jpg']).toBe('R');
      
      // Verify no write or execute permissions
      expect(res.body.privileges['owner-photo.jpg']).not.toContain('W');
      expect(res.body.privileges['owner-photo.jpg']).not.toContain('X');
    });

    test('Non-owner receives R only for multiple other user photos', async () => {
      // Seed multiple photos belonging to different owner
      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'owner-photo-1.jpg',
        state: 'working',
        storage_path: 'working/owner-photo-1.jpg',
        hash: 'owner-hash-1'
      });

      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'owner-photo-2.jpg',
        state: 'working',
        storage_path: 'working/owner-photo-2.jpg',
        hash: 'owner-hash-2'
      });

      // Request as non-owner
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${nonOwnerToken}`)
        .send({ filenames: ['owner-photo-1.jpg', 'owner-photo-2.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges['owner-photo-1.jpg']).toBe('R');
      expect(res.body.privileges['owner-photo-2.jpg']).toBe('R');
    });
  });

  describe('Batch Mixed Ownership', () => {
    test('Returns correct permissions for mix of owned and non-owned photos', async () => {
      // Seed photo owned by current user
      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'my-photo.jpg',
        state: 'working',
        storage_path: 'working/my-photo.jpg',
        hash: 'my-hash'
      });

      // Seed photo owned by another user
      mockDbHelpers.addMockPhoto({
        user_id: nonOwnerId,
        filename: 'their-photo.jpg',
        state: 'working',
        storage_path: 'working/their-photo.jpg',
        hash: 'their-hash'
      });

      // Request as owner - should get RWX for own, R for other
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filenames: ['my-photo.jpg', 'their-photo.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges['my-photo.jpg']).toBe('RWX');
      expect(res.body.privileges['their-photo.jpg']).toBe('R');
    });

    test('Handles large batch with mixed ownership efficiently', async () => {
      // Seed multiple photos with different owners
      for (let i = 1; i <= 10; i++) {
        mockDbHelpers.addMockPhoto({
          user_id: i % 2 === 0 ? ownerId : nonOwnerId,
          filename: `photo-${i}.jpg`,
          state: 'working',
          storage_path: `working/photo-${i}.jpg`,
          hash: `hash-${i}`
        });
      }

      const filenames = Array.from({ length: 10 }, (_, i) => `photo-${i + 1}.jpg`);

      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filenames });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Even-numbered photos belong to owner (RWX), odd to non-owner (R)
      expect(res.body.privileges['photo-2.jpg']).toBe('RWX');
      expect(res.body.privileges['photo-4.jpg']).toBe('RWX');
      expect(res.body.privileges['photo-1.jpg']).toBe('R');
      expect(res.body.privileges['photo-3.jpg']).toBe('R');
    });
  });

  describe('File Not Found', () => {
    test('Returns no permissions for non-existent file', async () => {
      // Request privilege for a file that doesn't exist in DB
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filenames: ['non-existent.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges['non-existent.jpg']).toBe('');
    });

    test('Returns mixed permissions for found and not-found files', async () => {
      // Seed one photo
      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'exists.jpg',
        state: 'working',
        storage_path: 'working/exists.jpg',
        hash: 'exists-hash'
      });

      // Request both existing and non-existing
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filenames: ['exists.jpg', 'not-exists.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges['exists.jpg']).toBe('RWX');
      expect(res.body.privileges['not-exists.jpg']).toBe('');
    });
  });

  describe('Authentication & Authorization', () => {
    test('Returns 401 without authentication token', async () => {
      const res = await request(app)
        .post('/privilege')
        .send({ filenames: ['test.jpg'] });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('token');
    });

    test('Returns 403 with invalid authentication token', async () => {
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', 'Bearer invalid-token')
        .send({ filenames: ['test.jpg'] });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('Handles empty filenames array gracefully', async () => {
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filenames: [] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges).toEqual({});
    });

    test('Legacy single file check returns restricted permissions', async () => {
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.privileges.read).toBe(false);
      expect(res.body.privileges.write).toBe(false);
      expect(res.body.privileges.execute).toBe(false);
    });

    test('Handles database errors gracefully', async () => {
      // Mock db to throw an error
      db.mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ filenames: ['test.jpg'] });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Internal server error');
    });
  });

  describe('Security: IDOR Prevention', () => {
    test('Prevents unauthorized write access via IDOR', async () => {
      // This test ensures the fix for CWE-639 (Insecure Direct Object Reference)
      // by verifying that users cannot gain write/delete permissions to files
      // they don't own, even if they know the filename
      
      mockDbHelpers.addMockPhoto({
        user_id: ownerId,
        filename: 'sensitive-photo.jpg',
        state: 'working',
        storage_path: 'working/sensitive-photo.jpg',
        hash: 'sensitive-hash'
      });

      // Attacker tries to check privileges for victim's photo
      const res = await request(app)
        .post('/privilege')
        .set('Authorization', `Bearer ${nonOwnerToken}`)
        .send({ filenames: ['sensitive-photo.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.privileges['sensitive-photo.jpg']).toBe('R');
      
      // Critical: Verify no destructive permissions granted
      expect(res.body.privileges['sensitive-photo.jpg']).not.toContain('W');
      expect(res.body.privileges['sensitive-photo.jpg']).not.toContain('X');
    });
  });
});
