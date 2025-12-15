/**
 * Tests for Users API Routes
 * 
 * This test suite verifies:
 * 1. POST /api/users/accept-terms requires authentication
 * 2. POST /api/users/accept-terms updates the database correctly
 * 3. POST /api/users/accept-terms works for both new and existing users
 */

const request = require('supertest');
const express = require('express');

// Mock Supabase
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser
    }
  })
}));

// Mock database
const mockInsert = jest.fn().mockReturnThis();
const mockOnConflict = jest.fn().mockReturnThis();
const mockMerge = jest.fn();
const mockDb = jest.fn(() => ({
  insert: mockInsert,
  onConflict: mockOnConflict,
  merge: mockMerge
}));
mockDb.fn = {
  now: () => 'CURRENT_TIMESTAMP'
};

const createUsersRouter = require('../routes/users');

describe('Users API Routes', () => {
  let app;
  let testUser;

  beforeEach(() => {
    mockGetUser.mockReset();
    mockInsert.mockClear();
    mockOnConflict.mockClear();
    mockMerge.mockClear();
    
    // Create Express app
    app = express();
    app.use(express.json());
    
    // Mount users routes
    const usersRouter = createUsersRouter({ db: mockDb });
    app.use('/api/users', usersRouter);
    
    // Standard test user
    testUser = {
      id: 'user-789',
      email: 'terms-test@example.com',
      user_metadata: { username: 'termsuser' },
      app_metadata: { role: 'user' }
    };
  });

  describe('POST /api/users/accept-terms', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/users/accept-terms')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    it('should return 403 with invalid Bearer token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      const response = await request(app)
        .post('/api/users/accept-terms')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should update database and return success with valid token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      // Mock successful database upsert
      mockMerge.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/users/accept-terms')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('terms_accepted_at');
      
      // Verify database calls
      expect(mockDb).toHaveBeenCalledWith('users');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testUser.id,
          terms_accepted_at: 'CURRENT_TIMESTAMP',
          created_at: 'CURRENT_TIMESTAMP',
          updated_at: 'CURRENT_TIMESTAMP'
        })
      );
      expect(mockOnConflict).toHaveBeenCalledWith('id');
      expect(mockMerge).toHaveBeenCalledWith(
        expect.objectContaining({
          terms_accepted_at: 'CURRENT_TIMESTAMP',
          updated_at: 'CURRENT_TIMESTAMP'
        })
      );
    });

    it('should work for existing users (update)', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      mockMerge.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/users/accept-terms')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // Verify upsert logic (insert + onConflict + merge)
      expect(mockOnConflict).toHaveBeenCalledWith('id');
      expect(mockMerge).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      // Mock database error
      mockMerge.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/users/accept-terms')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to record terms acceptance');
    });

    it('should use user ID from JWT token (security check)', async () => {
      const differentUser = {
        id: 'attacker-123',
        email: 'attacker@example.com',
        user_metadata: { username: 'attacker' },
        app_metadata: { role: 'user' }
      };

      mockGetUser.mockResolvedValue({
        data: { user: differentUser },
        error: null
      });

      mockMerge.mockResolvedValue(undefined);

      await request(app)
        .post('/api/users/accept-terms')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Verify the correct user ID was used (from JWT, not request body)
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: differentUser.id
        })
      );
    });
  });
});
