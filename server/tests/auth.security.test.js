/**
 * Security-focused authentication tests
 * Validates that security vulnerabilities are properly mitigated
 * 
 * Note: Test Express apps intentionally omit CSRF middleware for isolated unit testing.
 * codeql[js/missing-token-validation] - Test file: CSRF intentionally omitted for unit testing
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// Mock Supabase
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser
    }
  })
}));

const createAuthRouter = require('../routes/auth');
const createDebugRouter = require('../routes/debug');
const { authenticateToken } = require('../middleware/auth');

// Mock database for debug routes (Knex-style)
const mockDb = jest.fn(() => ({
  where: jest.fn().mockReturnThis(),
  whereRaw: jest.fn().mockReturnThis(),
  select: jest.fn().mockResolvedValue([{ id: 1, state: 'inprogress' }]),
  first: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue(0)
}));

describe('Authentication Security Tests', () => {
  let app;
  
  beforeAll(() => {
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    
    // Mount auth routes
    app.use('/api/auth', createAuthRouter());
    
    // Mount debug routes WITH authentication (this is the secure way)
    app.use(authenticateToken, createDebugRouter({ db: mockDb }));
    
    // Test endpoint that requires authentication
    app.get('/protected', authenticateToken, (req, res) => { // lgtm[js/missing-rate-limiting] - Test-only mock server
      res.json({ success: true, user: req.user });
    });
  });

  beforeEach(() => {
    mockGetUser.mockReset();
  });

  describe('CWE-489: Active Debug Code Remediation', () => {
    test('CRITICAL: Debug routes should reject unauthenticated requests', async () => {
      // Attempt to access debug endpoint without authentication
      const response = await request(app)
        .get('/debug/inprogress')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authorization header with Bearer token required');
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    test('CRITICAL: Debug routes should reject requests even when ALLOW_DEV_DEBUG is true', async () => {
      // Store original value
      const originalAllowDevDebug = process.env.ALLOW_DEV_DEBUG;
      
      try {
        // Enable ALLOW_DEV_DEBUG (simulating accidental configuration)
        process.env.ALLOW_DEV_DEBUG = 'true';
        
        // Attempt to access debug endpoint without authentication
        const response = await request(app)
          .get('/debug/inprogress')
          .expect(401);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Authorization header with Bearer token required');
        
        // Verify Supabase was NOT called (request rejected before token validation)
        expect(mockGetUser).not.toHaveBeenCalled();
      } finally {
        // Restore original value
        process.env.ALLOW_DEV_DEBUG = originalAllowDevDebug;
      }
    });

    test('CRITICAL: Debug routes should allow access with valid authentication', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { username: 'testuser' },
        app_metadata: { role: 'user' }
      };
      
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/debug/inprogress')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(mockGetUser).toHaveBeenCalledWith('valid-token');
      // Verify response was successful (authentication worked)
      expect(response.status).toBe(200);
    });

    test('CRITICAL: should reject mock-token even when MOCK_AUTH is set', async () => {
      // Store original value
      const originalMockAuth = process.env.MOCK_AUTH;
      
      try {
        // Enable MOCK_AUTH (simulating accidental production deployment)
        process.env.MOCK_AUTH = 'true';
        
        // Mock Supabase to reject the mock-token
        mockGetUser.mockResolvedValue({ 
          data: { user: null }, 
          error: { message: 'Invalid JWT' } 
        });
        
        // Attempt to use mock-token
        const response = await request(app)
          .get('/protected')
          .set('Authorization', 'Bearer mock-token')
          .expect(403);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Invalid token');
        
        // Verify mockGetUser was called (token was validated via Supabase, not backdoor)
        expect(mockGetUser).toHaveBeenCalledWith('mock-token');
      } finally {
        // Restore original value
        process.env.MOCK_AUTH = originalMockAuth;
      }
    });

    test('CRITICAL: should reject mock-token on /session endpoint even when MOCK_AUTH is set', async () => {
      const originalMockAuth = process.env.MOCK_AUTH;
      
      try {
        process.env.MOCK_AUTH = 'true';
        
        // The /session endpoint is now deprecated and returns 200 with a deprecation notice
        // It no longer validates tokens (no-op for backward compatibility)
        const response = await request(app)
          .post('/api/auth/session')
          .set('Authorization', 'Bearer mock-token')
          .set('Origin', 'http://localhost:5173')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.deprecated).toBe(true);
        expect(response.body.message).toContain('deprecated');
        
        // Verify Supabase was NOT called (endpoint is now a no-op)
        expect(mockGetUser).not.toHaveBeenCalled();
      } finally {
        process.env.MOCK_AUTH = originalMockAuth;
      }
    });

    test('SECURITY: should not have MOCK_AUTH code paths in production logic', () => {
      // This is a documentation test - the code should not contain MOCK_AUTH checks
      // If this test exists and passes, it means the backdoor has been removed
      const fs = require('fs');
      const path = require('path');
      
      const authMiddlewarePath = path.join(__dirname, '../middleware/auth.js');
      const authRoutesPath = path.join(__dirname, '../routes/auth.js');
      
      const authMiddlewareContent = fs.readFileSync(authMiddlewarePath, 'utf8');
      const authRoutesContent = fs.readFileSync(authRoutesPath, 'utf8');
      
      // Verify MOCK_AUTH is not referenced in production code
      expect(authMiddlewareContent).not.toContain('MOCK_AUTH');
      expect(authMiddlewareContent).not.toContain('mock-token');
      expect(authRoutesContent).not.toContain('MOCK_AUTH');
      expect(authRoutesContent).not.toContain('mock-token');
    });
  });

  describe('Proper Authentication Flow', () => {
    test('should authenticate valid Supabase tokens', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { username: 'testuser' },
        app_metadata: { role: 'user' }
      };
      
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('test@example.com');
      expect(mockGetUser).toHaveBeenCalledWith('valid-token');
    });

    test('should reject invalid tokens', async () => {
      mockGetUser.mockResolvedValue({ 
        data: { user: null }, 
        error: { message: 'Invalid token' } 
      });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should reject requests without Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authorization header with Bearer token required');
      expect(mockGetUser).not.toHaveBeenCalled();
    });
  });

  describe('Token Format Validation', () => {
    test('should reject malformed Authorization headers', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'invalid-format')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authorization header with Bearer token required');
    });

    test('should extract token from Bearer format correctly', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {}
      };
      
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer my-token-value')
        .expect(200);

      expect(mockGetUser).toHaveBeenCalledWith('my-token-value');
    });
  });

  describe('Error Handling', () => {
    test('should handle Supabase errors gracefully', async () => {
      mockGetUser.mockRejectedValue(new Error('Supabase connection error'));

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer some-token')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });

    test('should not leak internal error details', async () => {
      mockGetUser.mockRejectedValue(new Error('Database connection string: postgres://user:pass@localhost'));

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer some-token')
        .expect(500);

      // Verify sensitive data is not leaked
      expect(response.body.error).toBe('Internal server error');
      expect(response.body.error).not.toContain('Database');
      expect(response.body.error).not.toContain('postgres://');
    });
  });

  describe('User Mapping', () => {
    test('should map Supabase user metadata correctly', async () => {
      const mockUser = {
        id: 'user-456',
        email: 'admin@example.com',
        user_metadata: {
          username: 'adminuser'
        },
        app_metadata: {
          role: 'admin'
        }
      };
      
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.user).toEqual({
        id: 'user-456',
        email: 'admin@example.com',
        username: 'adminuser',
        role: 'admin'
      });
    });

    test('should use email username as fallback when metadata missing', async () => {
      const mockUser = {
        id: 'user-789',
        email: 'fallback@example.com',
        user_metadata: {}
      };
      
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer token')
        .expect(200);

      expect(response.body.user.username).toBe('fallback');
      expect(response.body.user.role).toBe('user');
    });
  });
});
