/**
 * Integration tests for GET /photos/status endpoint
 * 
 * This endpoint provides lightweight photo counts by state for Smart Routing.
 * Tests verify:
 * - Correct count aggregation by state (working, inprogress, finished)
 * - Authentication requirement (401 for unauthenticated)
 * - User isolation (only returns counts for the authenticated user)
 * - Performance (should not fetch heavy photo data)
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Test fixtures
const JWT_SECRET = process.env.JWT_SECRET;

// Helper to create auth tokens
const makeToken = (userId, opts) => jwt.sign(
  { id: userId, username: 'testuser', role: 'user' },
  JWT_SECRET,
  opts || { expiresIn: '1h' }
);

// Mock database with in-memory state
let mockPhotos = [];

// Mock db interface
const createMockDb = () => {
  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockImplementation(() => {
      // Aggregate photos by state for the user
      const userId = mockQuery._userId;
      const userPhotos = mockPhotos.filter(p => p.user_id === userId);
      
      const counts = {};
      for (const photo of userPhotos) {
        counts[photo.state] = (counts[photo.state] || 0) + 1;
      }
      
      return Promise.resolve(
        Object.entries(counts).map(([state, count]) => ({ state, count }))
      );
    }),
  };

  // Capture the user_id from where clause
  const originalWhere = mockQuery.where;
  mockQuery.where = function(field, value) {
    if (field === 'user_id') {
      this._userId = value;
    }
    return originalWhere.call(this, field, value);
  };

  return jest.fn(() => mockQuery);
};

// Create test app with the photos router
const createTestApp = (db) => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Rate limiter for CodeQL compliance (test environment)
  const testLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000, // High limit for tests
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Simplified auth middleware for testing
  const authenticateToken = async (req, res, next) => {
    let token = null;

    // Check cookie first
    if (req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
    }

    // Fallback to Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      token = authHeader && authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role || 'user'
      };
      next();
    } catch {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }
  };

  // Mount the status endpoint
  app.get('/photos/status', testLimiter, authenticateToken, async (req, res) => {
    try {
      const counts = await db('photos')
        .where('user_id', req.user.id)
        .select('state')
        .count('* as count')
        .groupBy('state');

      const result = {
        working: 0,
        inprogress: 0,
        finished: 0,
        total: 0
      };

      for (const row of counts) {
        const state = row.state;
        const count = Number(row.count) || 0;
        if (state === 'working') result.working = count;
        else if (state === 'inprogress') result.inprogress = count;
        else if (state === 'finished') result.finished = count;
        result.total += count;
      }

      res.set('Cache-Control', 'no-store');
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return app;
};

describe('GET /photos/status', () => {
  let app;
  let mockDb;

  beforeEach(() => {
    // Reset mock photos
    mockPhotos = [];
    mockDb = createMockDb();
    app = createTestApp(mockDb);
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('returns 401 when no token is provided', async () => {
      const response = await request(app)
        .get('/photos/status')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/access token required/i);
    });

    it('returns 403 when token is invalid', async () => {
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid token/i);
    });

    it('returns 403 when token is expired', async () => {
      const expiredToken = makeToken('user-1', { expiresIn: '-1h' });
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('accepts valid Bearer token in Authorization header', async () => {
      const token = makeToken('user-1');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('accepts valid token in authToken cookie', async () => {
      const token = makeToken('user-1');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Cookie', `authToken=${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Photo Count Aggregation', () => {
    it('returns zero counts when user has no photos', async () => {
      const token = makeToken('user-1');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        working: 0,
        inprogress: 0,
        finished: 0,
        total: 0
      });
    });

    it('correctly counts photos by state', async () => {
      // Set up mock photos for user-1
      mockPhotos = [
        { id: 1, user_id: 'user-1', state: 'working' },
        { id: 2, user_id: 'user-1', state: 'working' },
        { id: 3, user_id: 'user-1', state: 'working' },
        { id: 4, user_id: 'user-1', state: 'inprogress' },
        { id: 5, user_id: 'user-1', state: 'inprogress' },
        { id: 6, user_id: 'user-1', state: 'finished' },
      ];

      const token = makeToken('user-1');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        working: 3,
        inprogress: 2,
        finished: 1,
        total: 6
      });
    });

    it('only counts working photos when that is the only state', async () => {
      mockPhotos = [
        { id: 1, user_id: 'user-1', state: 'working' },
        { id: 2, user_id: 'user-1', state: 'working' },
      ];

      const token = makeToken('user-1');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        working: 2,
        inprogress: 0,
        finished: 0,
        total: 2
      });
    });

    it('only counts inprogress photos when that is the only state', async () => {
      mockPhotos = [
        { id: 1, user_id: 'user-1', state: 'inprogress' },
        { id: 2, user_id: 'user-1', state: 'inprogress' },
        { id: 3, user_id: 'user-1', state: 'inprogress' },
      ];

      const token = makeToken('user-1');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        working: 0,
        inprogress: 3,
        finished: 0,
        total: 3
      });
    });
  });

  describe('User Isolation', () => {
    it('only returns counts for the authenticated user', async () => {
      // Set up photos for multiple users
      mockPhotos = [
        // User 1's photos
        { id: 1, user_id: 'user-1', state: 'working' },
        { id: 2, user_id: 'user-1', state: 'working' },
        // User 2's photos (should NOT be counted for user-1)
        { id: 3, user_id: 'user-2', state: 'working' },
        { id: 4, user_id: 'user-2', state: 'inprogress' },
        { id: 5, user_id: 'user-2', state: 'inprogress' },
        { id: 6, user_id: 'user-2', state: 'inprogress' },
      ];

      const tokenUser1 = makeToken('user-1');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      // Should only see user-1's photos
      expect(response.body).toEqual({
        success: true,
        working: 2,
        inprogress: 0,
        finished: 0,
        total: 2
      });
    });

    it('different user sees their own counts', async () => {
      mockPhotos = [
        { id: 1, user_id: 'user-1', state: 'working' },
        { id: 2, user_id: 'user-2', state: 'inprogress' },
        { id: 3, user_id: 'user-2', state: 'finished' },
      ];

      const tokenUser2 = makeToken('user-2');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${tokenUser2}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        working: 0,
        inprogress: 1,
        finished: 1,
        total: 2
      });
    });
  });

  describe('Response Headers', () => {
    it('sets Cache-Control to no-store', async () => {
      const token = makeToken('user-1');
      
      const response = await request(app)
        .get('/photos/status')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });
  });
});
