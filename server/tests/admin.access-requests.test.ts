export {};

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
    if (tableName === 'contact_messages') {
      const chain = {
        select: jest.fn(function (this: any) {
          return this;
        }),
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
        del: jest.fn().mockResolvedValue(1),
        then: jest.fn((resolve: Function) =>
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
  let app: any;
  let mockDb: jest.Mock;

  const csrfToken: string = 'test-csrf-token';
  const adminToken: string = 'admin-token';

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
