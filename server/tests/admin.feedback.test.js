/**
 * Admin Feedback Endpoint Tests
 *
 * Tests for administrative endpoint:
 * - GET /api/admin/feedback - feedback moderation
 *
 * SECURITY TESTS:
 * - Verify admin role requirement (RBAC)
 * - Verify non-admin users receive 403 Forbidden
 * - Verify pagination and status filtering are supported
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const createAdminRouter = require('../routes/admin');

// Create a minimal test app (mirrors admin.invite.test.js patterns)
function createTestApp(db) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Mock CSRF middleware (accept all requests with proper headers)
  app.use((req, res, next) => {
    const csrfToken = 'test-csrf-token';
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (req.headers['x-csrf-token'] !== csrfToken || !req.cookies.csrfToken) {
        return res.status(403).json({ success: false, error: 'CSRF token mismatch or missing' });
      }
    }
    next();
  });

  // Mock auth middleware
  app.use('/api/admin', (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    if (token === 'admin-token') {
      req.user = { id: 'admin-id', email: 'admin@example.com', role: 'admin' };
    } else if (token === 'user-token') {
      req.user = { id: 'user-id', email: 'user@example.com', role: 'user' };
    } else {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    next();
  });

  // Mock requireRole middleware
  app.use('/api/admin', (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  });

  app.use('/api/admin', createAdminRouter({ db }));
  return app;
}

const createMockDb = () => {
  const mockFn = jest.fn((tableName) => {
    if (tableName === 'feedback_messages') {
      const chain = {
        where: jest.fn(function () {
          return this;
        }),
        orderBy: jest.fn(function () {
          return this;
        }),
        limit: jest.fn(function () {
          return this;
        }),
        offset: jest.fn(function () {
          return this;
        }),
        count: jest.fn().mockResolvedValue([{ total: '2' }]),
        select: jest.fn(function () {
          return this;
        }),
        then: jest.fn((resolve) =>
          resolve([
            {
              id: 'fb-1',
              message: 'First message',
              category: 'bug',
              status: 'new',
              url: 'http://localhost/test',
              context: { a: 1 },
              ip_address: '127.0.0.1',
              user_agent: 'test',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ])
        ),
      };
      return chain;
    }

    // Default chain for other tables if invoked
    return {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue([{ total: '0' }]),
    };
  });

  mockFn.fn = {
    now: jest.fn(() => 'NOW()'),
  };

  return mockFn;
};

describe('Admin Feedback', () => {
  let app;
  let mockDb;

  const csrfToken = 'test-csrf-token';
  const adminToken = 'admin-token';
  const userToken = 'user-token';

  beforeEach(() => {
    mockDb = createMockDb();
    app = createTestApp(mockDb);
  });

  describe('GET /api/admin/feedback', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/feedback')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject requests from non-admin users (403 Forbidden)', async () => {
      const response = await request(app)
        .get('/api/admin/feedback')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should return feedback for admin users', async () => {
      const response = await request(app)
        .get('/api/admin/feedback')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.total).toBe('number');

      // Verify Knex-style table call
      expect(mockDb).toHaveBeenCalledWith('feedback_messages');
    });

    it('should support pagination parameters (limit, offset)', async () => {
      const response = await request(app)
        .get('/api/admin/feedback?limit=10&offset=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(5);
    });

    it('should support filtering by status', async () => {
      const response = await request(app)
        .get('/api/admin/feedback?status=new')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const feedbackQuery = mockDb.mock.results.find(r => r?.value?.select && r?.value?.where)?.value;
      expect(feedbackQuery).toBeTruthy();
      expect(feedbackQuery.where).toHaveBeenCalledWith('status', 'new');
    });
  });
});
