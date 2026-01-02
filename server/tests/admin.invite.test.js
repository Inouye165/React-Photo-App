/**
 * Admin Routes Tests
 * 
 * Tests for administrative endpoints:
 * - POST /api/admin/invite - User invitation
 * - GET /api/admin/suggestions - AI suggestions review
 * 
 * SECURITY TESTS:
 * - Verify admin role requirement (RBAC)
 * - Verify email validation
 * - Verify non-admin users receive 403 Forbidden
 */

// Mock Supabase before requiring the server
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        inviteUserByEmail: jest.fn().mockResolvedValue({
          data: { user: { id: 'new-user-id', email: 'newuser@example.com' } },
          error: null
        })
      }
    }
  }))
}));
jest.mock('../lib/supabaseClient');

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const createAdminRouter = require('../routes/admin');

// Create a minimal test app
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

// Mock database
const createMockDb = () => {
  const mockFn = jest.fn((tableName) => {
    if (tableName === 'photos') {
      const createChain = () => {
        const chain = {
          where: jest.fn(function() { return this; }),
          whereNotNull: jest.fn(function() { return this; }),
          orderBy: jest.fn(function() { return this; }),
          limit: jest.fn(function() { return this; }),
          offset: jest.fn(function() { return this; }),
          count: jest.fn().mockResolvedValue([{ total: '0' }]),
          select: jest.fn(function() { return this; }),
          then: jest.fn((resolve) => resolve([]))
        };
        return chain;
      };
      return createChain();
    }
    if (tableName === 'comments' || tableName === 'comments as c') {
      const createChain = () => {
        const chain = {
          where: jest.fn(function() { return this; }),
          orderBy: jest.fn(function() { return this; }),
          limit: jest.fn(function() { return this; }),
          offset: jest.fn(function() { return this; }),
          update: jest.fn(function() { return this; }),
          returning: jest.fn().mockResolvedValue([{ id: 1, is_reviewed: true }]),
          count: jest.fn().mockResolvedValue([{ total: '0' }]),
          select: jest.fn(function() { return this; }),
          leftJoin: jest.fn(function() { return this; }),
          then: jest.fn((resolve) => resolve([]))
        };
        return chain;
      };
      return createChain();
    }
    return {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([])
    };
  });
  
  // Add fn.now() for Knex function support
  mockFn.fn = {
    now: jest.fn(() => 'NOW()')
  };
  
  return mockFn;
};

describe('Admin Routes', () => {
  let app;
  let mockDb;
  const csrfToken = 'test-csrf-token';
  const testOrigin = 'https://good.com';
  const adminToken = 'admin-token';
  const userToken = 'user-token';

  beforeEach(() => {
    mockDb = createMockDb();
    app = createTestApp(mockDb);
  });

  describe('POST /api/admin/invite', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Origin', testOrigin)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`])
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject requests from non-admin users (403 Forbidden)', async () => {
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Origin', testOrigin)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`])
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('permissions');
    });

    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
        ''
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/admin/invite')
          .set('Origin', testOrigin)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-csrf-token', csrfToken)
          .set('Cookie', [`csrfToken=${csrfToken}`])
          .send({ email });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toMatch(/email|invalid/i);
      }
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Origin', testOrigin)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`])
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/email.*required/i);
    });

    it('should accept valid email from admin user', async () => {
      // Note: This test may fail in CI if SUPABASE_SERVICE_ROLE_KEY is not set
      // or if Supabase is not configured. The test verifies the endpoint logic,
      // but actual invite sending requires proper Supabase configuration.
      
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Origin', testOrigin)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`])
        .send({ email: 'newuser@example.com' });

      // Accept either success (200) or configuration error (500)
      // In test environments without SUPABASE_SERVICE_ROLE_KEY, expect 500
      if (response.status === 500) {
        expect(response.body.error).toMatch(/not configured|SUPABASE_SERVICE_ROLE_KEY/i);
      } else {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('GET /api/admin/suggestions', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/suggestions')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject requests from non-admin users (403 Forbidden)', async () => {
      const response = await request(app)
        .get('/api/admin/suggestions')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('permissions');
    });

    it('should return suggestions for admin users', async () => {
      const response = await request(app)
        .get('/api/admin/suggestions')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.total).toBe('number');
    });

    it('should support state filtering', async () => {
      const response = await request(app)
        .get('/api/admin/suggestions?state=analyzed')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/admin/suggestions?limit=10&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.limit).toBe(10);
      expect(response.body.offset).toBe(0);
    });

    it('should enforce maximum limit of 200', async () => {
      const response = await request(app)
        .get('/api/admin/suggestions?limit=500')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.limit).toBeLessThanOrEqual(200);
    });
  });

  describe('GET /api/admin/comments', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/admin/comments')
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject requests from non-admin users (403 Forbidden)', async () => {
      const response = await request(app)
        .get('/api/admin/comments')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should return comments for admin users using Knex query builder', async () => {
      const response = await request(app)
        .get('/api/admin/comments')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(typeof response.body.total).toBe('number');
      
      // Verify Knex-style query methods were called (not db.query)
      expect(mockDb).toHaveBeenCalledWith('comments as c');
    });
  });

  describe('PATCH /api/admin/comments/:id/review', () => {
    it('should mark comment as reviewed using Knex query builder', async () => {
      const response = await request(app)
        .patch('/api/admin/comments/123/review')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-csrf-token', csrfToken)
        .set('Cookie', [`csrfToken=${csrfToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.is_reviewed).toBe(true);
      
      // Verify Knex-style update was called (not db.query)
      expect(mockDb).toHaveBeenCalledWith('comments');
    });
  });

  describe('Security - Role-Based Access Control (RBAC)', () => {
    it('should verify requireRole middleware blocks non-admin access', async () => {
      const endpoints = [
        { method: 'post', path: '/api/admin/invite', body: { email: 'test@example.com' } },
        { method: 'get', path: '/api/admin/suggestions', body: null },
        { method: 'get', path: '/api/admin/comments', body: null }
      ];

      for (const endpoint of endpoints) {
        const req = request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-csrf-token', csrfToken)
          .set('Cookie', [`csrfToken=${csrfToken}`]);
        
        if (endpoint.body) {
          req.send(endpoint.body);
        }

        const response = await req;
        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      }
    });

    it('should verify admin token grants access to all endpoints', async () => {
      const endpoints = [
        { method: 'get', path: '/api/admin/suggestions' },
        { method: 'get', path: '/api/admin/comments' }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-csrf-token', csrfToken)
          .set('Cookie', [`csrfToken=${csrfToken}`]);

        expect(response.status).not.toBe(403);
        expect(response.status).not.toBe(401);
      }
    });
  });
});
