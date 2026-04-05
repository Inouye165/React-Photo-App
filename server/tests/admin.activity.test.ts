export {};

/**
 * Admin Activity Endpoint Tests
 *
 * Tests for:
 * - GET /api/admin/activity
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const createAdminRouter = require('../routes/admin');

function createTestApp(db: any): any {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use((req: any, res: any, next: Function) => {
    const csrfToken: string = 'test-csrf-token';
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (req.headers['x-csrf-token'] !== csrfToken || !req.cookies.csrfToken) {
        return res.status(403).json({ success: false, error: 'CSRF token mismatch or missing' });
      }
    }
    next();
  });

  app.use('/api/admin', (req: any, res: any, next: Function) => {
    const authHeader: string | undefined = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token: string = authHeader.split(' ')[1];
    if (token === 'admin-token') {
      req.user = { id: 'admin-id', email: 'admin@example.com', role: 'admin' };
    } else if (token === 'user-token') {
      req.user = { id: 'user-id', email: 'user@example.com', role: 'user' };
    } else {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    next();
  });

  app.use('/api/admin', (req: any, res: any, next: Function) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  });

  app.use('/api/admin', createAdminRouter({ db }));
  return app;
}

const createMockDb = (): jest.Mock => {
  const mockFn: jest.Mock = jest.fn((tableName: string) => {
    if (tableName === 'user_activity_log') {
      const chain = {
        where: jest.fn(function (this: any) {
          return this;
        }),
        orderBy: jest.fn(function (this: any) {
          return this;
        }),
        limit: jest.fn(function (this: any) {
          return this;
        }),
        offset: jest.fn(function (this: any) {
          return this;
        }),
        count: jest.fn().mockResolvedValue([{ total: '1' }]),
        select: jest.fn(function (this: any) {
          return this;
        }),
        then: jest.fn((resolve: Function) =>
          resolve([
            {
              id: 'log-1',
              user_id: 'user-1',
              action: 'sign_in',
              metadata: { source: 'test' },
              created_at: new Date().toISOString(),
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

  (mockFn as any).fn = {
    now: jest.fn(() => 'NOW()'),
  };

  return mockFn;
};

describe('Admin Activity', () => {
  let app: any;
  let mockDb: jest.Mock;

  const csrfToken: string = 'test-csrf-token';
  const adminToken: string = 'admin-token';
  const userToken: string = 'user-token';

  beforeEach(() => {
    mockDb = createMockDb();
    app = createTestApp(mockDb);
  });

  describe('GET /api/admin/activity', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/activity')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject requests from non-admin users', async () => {
      const response = await request(app)
        .get('/api/admin/activity')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should return activity for admin users', async () => {
      const response = await request(app)
        .get('/api/admin/activity')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.total).toBe('number');
      expect(mockDb).toHaveBeenCalledWith('user_activity_log');
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/admin/activity?limit=10&offset=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(5);
    });

    it('should support filtering by action', async () => {
      const response = await request(app)
        .get('/api/admin/activity?action=sign_in')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const activityQuery = mockDb.mock.results.find((r: any) => r?.value?.select && r?.value?.where)?.value;
      expect(activityQuery).toBeTruthy();
      expect(activityQuery.where).toHaveBeenCalledWith('action', 'sign_in');
    });
  });
});
