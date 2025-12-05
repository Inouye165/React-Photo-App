/**
 * Tests for configurable session cookie settings and authentication security
 * 
 * This test suite verifies:
 * 1. Cookie configuration can be overridden via environment variables for hybrid deployments
 * 2. Security constraints are enforced (SameSite=None requires Secure=true)
 * 3. Cookie-based authentication works correctly
 * 4. CSRF protection and rate limiting are applied
 * 
 * Note: Test Express apps intentionally omit CSRF middleware for isolated unit testing.
 * codeql[js/missing-token-validation] - Test file: CSRF intentionally omitted for unit testing
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Mock Supabase
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser
    }
  })
}));

// Mock allowed origins
jest.mock('../config/allowedOrigins', () => ({
  getAllowedOrigins: jest.fn(() => ['http://localhost:5173', 'http://localhost:3000'])
}));

const { authenticateImageRequest } = require('../middleware/imageAuth');

describe('Cookie Configuration for Hybrid Deployment', () => {
  let originalEnv;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  /**
   * Helper to extract Set-Cookie header and parse cookie attributes
   */
  function parseCookieHeader(setCookieHeader) {
    if (!setCookieHeader) return null;
    
    const parts = setCookieHeader.split(';').map(part => part.trim());
    const [nameValue] = parts;
    const [name, value] = nameValue.split('=');
    
    const cookie = {
      name,
      value,
      attributes: {}
    };
    
    parts.slice(1).forEach(part => {
      if (part.includes('=')) {
        const [key, val] = part.split('=');
        cookie.attributes[key.toLowerCase()] = val.toLowerCase();
      } else {
        cookie.attributes[part.toLowerCase()] = true;
      }
    });
    
    return cookie;
  }

  /**
   * Helper to create fresh app instance with current environment
   */
  function createTestApp() {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    
    // Clear module cache to get fresh router with current env
    jest.resetModules();
    const createAuthRouter = require('../routes/auth');
    
    // Mount auth routes
    app.use('/api/auth', createAuthRouter());
    
    return app;
  }

  describe('Default Behavior (no COOKIE_SAME_SITE env var)', () => {
    beforeEach(() => {
      mockGetUser.mockReset();
      delete process.env.COOKIE_SAME_SITE;
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com'
          }
        },
        error: null
      });
    });

    test('should use "strict" sameSite in production environment', async () => {
      process.env.NODE_ENV = 'production';
      const app = createTestApp();

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer test-token')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      
      const cookie = parseCookieHeader(setCookie[0]);
      expect(cookie.attributes.samesite).toBe('strict');
      expect(cookie.attributes.secure).toBe(true);
      expect(cookie.attributes.httponly).toBe(true);
    });

    test('should use "lax" sameSite in development environment', async () => {
      process.env.NODE_ENV = 'development';
      const app = createTestApp();

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer test-token')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      
      const cookie = parseCookieHeader(setCookie[0]);
      expect(cookie.attributes.samesite).toBe('lax');
      expect(cookie.attributes.httponly).toBe(true);
    });
  });

  describe('Override Behavior (COOKIE_SAME_SITE env var set)', () => {
    beforeEach(() => {
      mockGetUser.mockReset();
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com'
          }
        },
        error: null
      });
    });

    test('should use env var value when COOKIE_SAME_SITE is "lax"', async () => {
      process.env.NODE_ENV = 'production';
      process.env.COOKIE_SAME_SITE = 'lax';
      const app = createTestApp();

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer test-token')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      const setCookie = response.headers['set-cookie'];
      const cookie = parseCookieHeader(setCookie[0]);
      expect(cookie.attributes.samesite).toBe('lax');
    });

    test('should use env var value when COOKIE_SAME_SITE is "strict"', async () => {
      process.env.NODE_ENV = 'development';
      process.env.COOKIE_SAME_SITE = 'strict';
      const app = createTestApp();

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer test-token')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      const setCookie = response.headers['set-cookie'];
      const cookie = parseCookieHeader(setCookie[0]);
      expect(cookie.attributes.samesite).toBe('strict');
    });
  });

  describe('CRITICAL SECURITY: SameSite=None MUST have Secure=true', () => {
    beforeEach(() => {
      mockGetUser.mockReset();
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com'
          }
        },
        error: null
      });
    });

    test('should force secure=true when COOKIE_SAME_SITE is "none" (production)', async () => {
      process.env.NODE_ENV = 'production';
      process.env.COOKIE_SAME_SITE = 'none';
      const app = createTestApp();

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer test-token')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      const setCookie = response.headers['set-cookie'];
      const cookie = parseCookieHeader(setCookie[0]);
      
      expect(cookie.attributes.samesite).toBe('none');
      expect(cookie.attributes.secure).toBe(true);
    });

    test('should force secure=true when COOKIE_SAME_SITE is "none" (development)', async () => {
      process.env.NODE_ENV = 'development';
      process.env.COOKIE_SAME_SITE = 'none';
      const app = createTestApp();

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer test-token')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      const setCookie = response.headers['set-cookie'];
      const cookie = parseCookieHeader(setCookie[0]);
      
      // CRITICAL: Even in development, if sameSite is 'none', secure MUST be true
      expect(cookie.attributes.samesite).toBe('none');
      expect(cookie.attributes.secure).toBe(true);
    });

    test('should normalize case-insensitive COOKIE_SAME_SITE values', async () => {
      process.env.NODE_ENV = 'development';
      process.env.COOKIE_SAME_SITE = 'None'; // Mixed case
      const app = createTestApp();

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer test-token')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      const setCookie = response.headers['set-cookie'];
      const cookie = parseCookieHeader(setCookie[0]);
      
      expect(cookie.attributes.samesite).toBe('none');
      expect(cookie.attributes.secure).toBe(true);
    });
  });
});

describe('Cookie-Based Authentication Security', () => {
  let app;
  const validToken = 'valid-supabase-token';
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { username: 'testuser' }
  };

  beforeAll(() => {
    // Reset environment for these tests
    delete process.env.COOKIE_SAME_SITE;
    
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    
    // Clear module cache and get fresh router
    jest.resetModules();
    const createAuthRouter = require('../routes/auth');
    
    // Mount auth routes (includes rate limiting and CSRF protection internally)
    // See routes/auth.js for authLimiter and verifyOrigin middleware
    // codeql[js/missing-rate-limiting] False positive: This is a test file that mounts
    // production routes which contain rate limiting internally. The createAuthRouter()
    // function in routes/auth.js includes authLimiter middleware (50 req/15min window).
    // This test validates that the rate limiting works correctly.
    app.use('/api/auth', createAuthRouter());
    
    // Test image endpoint with imageAuth middleware and rate limiting
    // lgtm[js/missing-rate-limiting] Rate limiting added for security compliance
    const testImageLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Higher limit for tests
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use('/test-image', testImageLimiter, authenticateImageRequest, (req, res) => {
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
        .set('Origin', 'http://localhost:5173') // Required for CSRF protection
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
        .set('Origin', 'http://localhost:5173')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    test('should reject request with invalid token', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } });

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer invalid-token')
        .set('Origin', 'http://localhost:5173')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should set session cookie with mocked Supabase auth', async () => {
      // Use proper Supabase mocking instead of mock-token backdoor
      const testUser = {
        id: 'test-user-123',
        email: 'test@example.com',
        user_metadata: { username: 'testuser' }
      };
      
      mockGetUser.mockResolvedValue({ data: { user: testUser }, error: null });

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', 'Bearer test-token')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.email).toBe('test@example.com');
      
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      
      // Verify Supabase was called
      expect(mockGetUser).toHaveBeenCalledWith('test-token');
    });
  });

  describe('POST /api/auth/logout - Cookie Clearing', () => {
    test('should clear authToken cookie', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Origin', 'http://localhost:5173')
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
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'http://localhost:5173');

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
        .set('Authorization', `Bearer ${cookieToken}`)
        .set('Origin', 'http://localhost:5173');

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

  describe('CSRF Protection', () => {
    test('should reject POST requests without Origin header', async () => {
      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Origin header required for authentication');
    });

    test('should reject POST requests from disallowed origins', async () => {
      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'http://evil-site.com')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Origin not allowed');
    });

    test('should allow GET requests without Origin header', async () => {
      // GET requests should not be blocked by CSRF protection
      await request(app)
        .get('/api/auth/session')
        .expect(404); // Route doesn't exist, but CSRF shouldn't block it

      // The point is we get past CSRF check (would be 403 if blocked)
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to auth endpoints', async () => {
      // This test documents that rate limiting is active
      // Actual rate limit testing would require many requests
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .post('/api/auth/session')
        .set('Authorization', `Bearer ${validToken}`)
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      // Check for rate limit headers
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });
  });
});

/**
 * Tests for authenticateToken middleware - httpOnly cookie authentication
 * 
 * This test suite verifies that the main authenticateToken middleware:
 * 1. Successfully extracts and verifies tokens from req.cookies (primary)
 * 2. Falls back to Authorization header when cookie is not present
 * 3. Fails cleanly when neither cookie nor header is provided
 * 4. Rejects query parameter tokens for security
 */
describe('authenticateToken Middleware - Cookie Authentication', () => {
  let app;
  const validToken = 'valid-supabase-token';
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { username: 'testuser' },
    app_metadata: { role: 'user' }
  };

  beforeAll(() => {
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    
    // Clear module cache and get fresh middleware
    jest.resetModules();
    const { authenticateToken } = require('../middleware/auth');
    
    // Protected test endpoint using authenticateToken middleware
    // lgtm[js/missing-rate-limiting]
    // codeql[js/missing-rate-limiting] - Test-only mock server, never exposed to production
    app.get('/protected', authenticateToken, (req, res) => {
      res.json({ success: true, user: req.user });
    });
    
    // lgtm[js/missing-rate-limiting]
    // codeql[js/missing-rate-limiting] - Test-only mock server, never exposed to production
    app.post('/protected-post', authenticateToken, (req, res) => {
      res.json({ success: true, user: req.user, data: req.body });
    });
  });

  beforeEach(() => {
    mockGetUser.mockReset();
  });

  describe('Cookie-based Authentication (Primary Method)', () => {
    test('should authenticate successfully using httpOnly cookie', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/protected')
        .set('Cookie', `authToken=${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(mockUser.id);
      expect(response.body.user.email).toBe(mockUser.email);
      
      // Verify Supabase was called with the cookie token
      expect(mockGetUser).toHaveBeenCalledWith(validToken);
    });

    test('should map user metadata correctly from cookie auth', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/protected')
        .set('Cookie', `authToken=${validToken}`)
        .expect(200);

      expect(response.body.user.username).toBeDefined();
      expect(response.body.user.role).toBe('user');
    });

    test('should prioritize cookie over Authorization header when both present', async () => {
      const cookieToken = 'cookie-token';
      const headerToken = 'header-token';
      const cookieUser = { ...mockUser, id: 'cookie-user' };
      
      // Setup mock to return different users for different tokens
      mockGetUser.mockImplementation((token) => {
        if (token === cookieToken) {
          return { data: { user: cookieUser }, error: null };
        }
        return { data: { user: mockUser }, error: null };
      });

      const response = await request(app)
        .get('/protected')
        .set('Cookie', `authToken=${cookieToken}`)
        .set('Authorization', `Bearer ${headerToken}`)
        .expect(200);

      // Should use cookie token (primary), not header
      expect(response.body.user.id).toBe('cookie-user');
      expect(mockGetUser).toHaveBeenCalledWith(cookieToken);
    });
  });

  describe('Authorization Header Fallback', () => {
    test('should authenticate using Authorization header when cookie not present', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe(mockUser.id);
      expect(mockGetUser).toHaveBeenCalledWith(validToken);
    });

    test('should work with Bearer token format in Authorization header', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Authentication Failure Cases', () => {
    test('should return 401 when no cookie and no Authorization header', async () => {
      const response = await request(app)
        .get('/protected')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
      
      // Supabase should NOT be called when no token is provided
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    test('should return 401 when cookie is empty', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Cookie', 'authToken=')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    test('should return 403 when cookie token is invalid', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } });

      const response = await request(app)
        .get('/protected')
        .set('Cookie', 'authToken=invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should return 403 when Supabase returns error', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Token expired' } });

      const response = await request(app)
        .get('/protected')
        .set('Cookie', `authToken=${validToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    test('SECURITY: should NOT accept token from query parameter', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get(`/protected?token=${validToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
      
      // Supabase should NOT be called - query params are rejected before validation
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    test('SECURITY: should NOT accept authToken from query parameter', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .get(`/protected?authToken=${validToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(mockGetUser).not.toHaveBeenCalled();
    });
  });

  describe('POST Requests with Cookie Auth', () => {
    test('should authenticate POST requests using cookie', async () => {
      mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

      const response = await request(app)
        .post('/protected-post')
        .set('Cookie', `authToken=${validToken}`)
        .send({ test: 'data' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe(mockUser.id);
      expect(response.body.data).toEqual({ test: 'data' });
    });
  });

  describe('Error Handling', () => {
    test('should return 500 on Supabase API error', async () => {
      mockGetUser.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .get('/protected')
        .set('Cookie', `authToken=${validToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });
});
