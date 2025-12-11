/**
 * Tests for Bearer Token Authentication (Primary Auth Method)
 * 
 * This test suite verifies:
 * 1. Bearer token in Authorization header is the primary auth method
 * 2. Cookie-based auth is supported as deprecated fallback
 * 3. Missing auth returns 401 with safe error message
 * 4. Invalid/malformed tokens return 403
 * 5. req.user is correctly populated from valid tokens
 * 6. Tokens are NEVER logged in error messages
 * 
 * Note: Test Express apps intentionally omit CSRF middleware for isolated unit testing.
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Mock Supabase before requiring the middleware
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser
    }
  })
}));

const { authenticateToken } = require('../middleware/auth');

describe('Bearer Token Authentication - Primary Auth Method', () => {
  let app;
  let testUser;

  beforeEach(() => {
    mockGetUser.mockReset();
    
    // Create fresh Express app for each test
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    
    // Test route that requires authentication
    app.get('/api/test/protected', authenticateToken, (req, res) => {
      res.json({
        success: true,
        user: req.user,
        authSource: req.authSource
      });
    });
    
    // Standard test user
    testUser = {
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: { username: 'testuser' },
      app_metadata: { role: 'user' }
    };
  });

  describe('Valid Bearer Token in Authorization Header (Primary)', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });
    });

    it('should authenticate with valid Bearer token', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe('user-123');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.authSource).toBe('bearer');
    });

    it('should populate req.user correctly from Supabase user', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer valid-jwt-token')
        .expect(200);

      expect(response.body.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user'
      });
    });

    it('should use app_metadata for role (not user_metadata)', async () => {
      // User with admin role in app_metadata
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            ...testUser,
            app_metadata: { role: 'admin' }
          }
        },
        error: null
      });

      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.user.role).toBe('admin');
    });

    it('should fallback to "user" role when app_metadata.role is missing', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            ...testUser,
            app_metadata: {} // No role
          }
        },
        error: null
      });

      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer token-no-role')
        .expect(200);

      expect(response.body.user.role).toBe('user');
    });
  });

  describe('Missing Authorization Header', () => {
    it('should return 401 when no Authorization header is present', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    it('should return safe error message without sensitive token values', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .expect(401);

      // Error should NOT contain any actual JWT tokens or sensitive info
      // The generic message "Access token required" is acceptable
      expect(response.body.error).not.toContain('Bearer');
      expect(response.body.error).not.toContain('jwt');
      expect(response.body.error).not.toContain('secret');
      expect(response.body.error).toBe('Access token required');
    });
  });

  describe('Invalid/Malformed Bearer Token', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });
    });

    it('should return 403 for invalid token', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should return 403 for expired token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token expired' }
      });

      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer expired-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should NOT include actual token in error response', async () => {
      const sensitiveToken = 'super-secret-sensitive-token-12345';
      
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', `Bearer ${sensitiveToken}`)
        .expect(403);

      // Response should NOT contain the actual token
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain(sensitiveToken);
      expect(responseText).not.toContain('super-secret');
    });
  });

  describe('Malformed Authorization Header', () => {
    it('should return 401 when Authorization header has no Bearer prefix', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'just-a-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    it('should return 401 when Authorization header is empty', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', '')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 when Authorization header is "Bearer " with no token', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer ')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Cookie-Based Auth (Deprecated Fallback)', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });
    });

    it('should still authenticate with cookie when no Bearer token is present', async () => {
      const response = await request(app)
        .get('/api/test/protected')
        .set('Cookie', 'authToken=cookie-jwt-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe('user-123');
      expect(response.body.authSource).toBe('cookie');
    });

    it('should prefer Bearer token over cookie when both are present', async () => {
      // Different tokens to distinguish which was used
      let tokenUsed = null;
      mockGetUser.mockImplementation((token) => {
        tokenUsed = token;
        return Promise.resolve({
          data: { user: testUser },
          error: null
        });
      });

      await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer bearer-token')
        .set('Cookie', 'authToken=cookie-token')
        .expect(200);

      // Should use Bearer token, not cookie
      expect(tokenUsed).toBe('bearer-token');
    });
  });

  describe('Query Parameter Token (Security - Blocked)', () => {
    it('should NOT accept token in query parameter', async () => {
      const response = await request(app)
        .get('/api/test/protected?token=query-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    it('should NOT accept access_token in query parameter', async () => {
      const response = await request(app)
        .get('/api/test/protected?access_token=query-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Server Error Handling', () => {
    it('should return 500 for Supabase API errors', async () => {
      mockGetUser.mockRejectedValue(new Error('Supabase connection failed'));

      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });

    it('should NOT leak internal error details in response', async () => {
      mockGetUser.mockRejectedValue(new Error('Database connection string: postgres://user:pass@host'));

      const response = await request(app)
        .get('/api/test/protected')
        .set('Authorization', 'Bearer valid-token')
        .expect(500);

      // Response should NOT contain sensitive details
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('postgres');
      expect(responseText).not.toContain('Database');
      expect(responseText).not.toContain('pass@host');
    });
  });
});

describe('CORS Configuration - Authorization Header', () => {
  it('should allow Authorization header in CORS preflight', async () => {
    const express = require('express');
    const cors = require('cors');
    
    const app = express();
    app.use(cors({
      origin: 'http://localhost:5173',
      credentials: true
    }));
    
    app.options('/api/test', (req, res) => res.sendStatus(204));
    
    const response = await request(app)
      .options('/api/test')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization')
      .expect(204);

    // CORS should allow Authorization header
    expect(response.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });
});
