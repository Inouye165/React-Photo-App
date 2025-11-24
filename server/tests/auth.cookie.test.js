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
const { authenticateImageRequest } = require('../middleware/imageAuth');

describe('Cookie-Based Authentication Security', () => {
  let app;
  const validToken = 'valid-supabase-token';
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { username: 'testuser' }
  };

  beforeAll(() => {
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    
    // Mount auth routes
    app.use('/api/auth', createAuthRouter());
    
    // Test image endpoint with imageAuth middleware
    app.use('/test-image', authenticateImageRequest, (req, res) => {
      res.json({ success: true, user: req.user });
    });
  });

  beforeEach(() => {
    mockGetUser.mockReset();
  });

  describe('POST /api/auth/session - Cookie Setting', () => {
    test('should set httpOnly cookie with valid token', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Session cookie set successfully');
      
      // Verify Set-Cookie header
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.length).toBeGreaterThan(0);
      
      const authCookie = cookies.find(c => c.startsWith('authToken='));
      expect(authCookie).toBeDefined();
      
      // Verify security attributes
      expect(authCookie).toContain('HttpOnly');
      expect(authCookie).toContain('Path=/');
    });

    test('should reject request without Authorization header', async () => {
      const response = await request(app)
        .post('/api/auth/session')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    test('should reject request with invalid token', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } });

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should support mock auth in test environment', async () => {
      const originalMockAuth = process.env.MOCK_AUTH;
      process.env.MOCK_AUTH = 'true';

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer mock-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();

      process.env.MOCK_AUTH = originalMockAuth;
    });
  });

  describe('POST /api/auth/logout - Cookie Clearing', () => {
    test('should clear authToken cookie', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Session cookie cleared');
      
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      
      const authCookie = cookies.find(c => c.startsWith('authToken='));
      expect(authCookie).toBeDefined();
      // Cookie should be expired/cleared
      expect(authCookie).toMatch(/authToken=;/);
    });
  });

  describe('Image Authentication with Cookie', () => {
    test('should allow image access with valid cookie', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      // First, set the cookie
      const loginResponse = await request(app)
        .post('/api/auth/session')
        .set('Authorization', `Bearer ${validToken}`);

      const cookies = loginResponse.headers['set-cookie'];
      
      // Now access image with cookie
      const imageResponse = await request(app)
        .get('/test-image')
        .set('Cookie', cookies)
        .expect(200);

      expect(imageResponse.body.success).toBe(true);
      expect(imageResponse.body.user).toBeDefined();
    });

    test('should allow image access with Authorization header', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/test-image')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
    });

    test('should reject image access without authentication', async () => {
      const response = await request(app)
        .get('/test-image')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required for image access');
    });

    test('SECURITY: should reject query parameter token (deprecated)', async () => {
      // This is the critical security test - query params should NOT work
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/test-image?token=' + validToken)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required for image access');
      
      // Verify mockGetUser was NOT called (token should be rejected before validation)
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    test('SECURITY: should reject query parameter even with valid Supabase token', async () => {
      // Double-check that even if the query param token is valid, it's rejected
      const response = await request(app)
        .get('/test-image')
        .query({ token: validToken })
        .expect(401);

      expect(response.body.error).toBe('Access token required for image access');
    });

    test('should prioritize Authorization header over cookie', async () => {
      mockGetUser
        .mockResolvedValueOnce({ data: { user: { id: 'cookie-user' } }, error: null })
        .mockResolvedValueOnce({ data: { user: { id: 'header-user' } }, error: null });

      // Set cookie with first token
      const cookieToken = 'cookie-token';
      const loginResponse = await request(app)
        .post('/api/auth/session')
        .set('Authorization', `Bearer ${cookieToken}`);

      const cookies = loginResponse.headers['set-cookie'];

      // Request with both cookie and different header token
      const headerToken = 'header-token';
      const response = await request(app)
        .get('/test-image')
        .set('Cookie', cookies)
        .set('Authorization', `Bearer ${headerToken}`)
        .expect(200);

      // Should use header token, not cookie
      expect(response.body.user.id).toBe('header-user');
    });

    test('should handle CORS preflight with OPTIONS', async () => {
      const response = await request(app)
        .options('/test-image')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      // Should not require authentication for OPTIONS
      expect(response.status).toBe(200);
    });
  });

  describe('JWT Secret Fallback', () => {
    test('should fall back to Supabase when JWT_SECRET not available', async () => {
      // When JWT_SECRET is not set, should use Supabase validation
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/test-image')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should have used Supabase
      expect(mockGetUser).toHaveBeenCalled();
    });

    test('should fall back to Supabase if JWT verification fails', async () => {
      // Even if JWT_SECRET exists, invalid JWTs should fall back to Supabase
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/test-image')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should have fallen back to Supabase
      expect(mockGetUser).toHaveBeenCalled();
    });
  });

  describe('Security Headers', () => {
    test('should set CORS headers correctly', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/test-image')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });
  });
});
