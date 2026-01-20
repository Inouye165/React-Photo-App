/**
 * Admin Access Requests Endpoint Tests
 *
 * Tests for administrative endpoints:
 * - GET /api/admin/access-requests
 * - DELETE /api/admin/access-requests/:id
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const createAdminRouter = require('../routes/admin');

function createTestApp(db) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use((req, res, next) => {
    const csrfToken = 'test-csrf-token';
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (req.headers['x-csrf-token'] !== csrfToken || !req.cookies.csrfToken) {
        return res.status(403).json({ success: false, error: 'CSRF token mismatch or missing' });
      }
    }
    next();
  });

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
    if (tableName === 'contact_messages') {
      const chain = {
        select: jest.fn(function () {
          return this;
        }),
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
        count: jest.fn().mockResolvedValue([{ total: '1' }]),
        del: jest.fn().mockResolvedValue(1),
        then: jest.fn((resolve) =>
          resolve([
            {
              id: '11111111-1111-4111-8111-111111111111',
              name: 'Jane Doe',
              email: 'jane@example.com',
              subject: 'Access Request: General Inquiry',
              message: 'Please grant access.',
              status: 'new',
              ip_address: '127.0.0.1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ])
        ),
      };
      return chain;
    }

    return {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue([{ total: '0' }]),
    };
  });

  return mockFn;
};

describe('Admin Access Requests', () => {
  let app;
  let mockDb;

  const csrfToken = 'test-csrf-token';
  const adminToken = 'admin-token';

  beforeEach(() => {
    mockDb = createMockDb();
    app = createTestApp(mockDb);
  });

  describe('GET /api/admin/access-requests', () => {
    it('returns access requests for admin users', async () => {
      const response = await request(app)
        .get('/api/admin/access-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(mockDb).toHaveBeenCalledWith('contact_messages');
    });
  });

  describe('DELETE /api/admin/access-requests/:id', () => {
    it('deletes an access request', async () => {
      const response = await request(app)
        .delete('/api/admin/access-requests/11111111-1111-4111-8111-111111111111')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
