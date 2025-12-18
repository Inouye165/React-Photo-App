/**
 * Tests for Protected Routes with Bearer Token Authentication
 * 
 * This test suite verifies:
 * 1. /api/users/me returns 401 without auth
 * 2. /api/users/me returns 200 with valid Bearer token
 * 3. /photos endpoints require authentication
 * 4. Protected endpoints return correct user identity
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

// Mock database
const mockDb = {
  raw: jest.fn(),
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn()
};

const { authenticateToken } = require('../middleware/auth');

describe('Protected Routes - Bearer Token Authentication', () => {
  let app;
  let testUser;

  beforeEach(() => {
    mockGetUser.mockReset();
    mockDb.first.mockReset();
    
    // Create Express app
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    
    // Mock /api/users/me endpoint
    app.get('/api/users/me', authenticateToken, (req, res) => {
      res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          username: req.user.username,
          role: req.user.role
        }
      });
    });
    
    // Mock /photos endpoint
    app.get('/photos', authenticateToken, (req, res) => {
      res.json({
        success: true,
        photos: [],
        userId: req.user.id
      });
    });
    
    // Mock /photos/:id endpoint
    app.get('/photos/:id', authenticateToken, (req, res) => {
      res.json({
        success: true,
        photo: { id: req.params.id },
        userId: req.user.id
      });
    });
    
    // Standard test user
    testUser = {
      id: 'user-456',
      email: 'route-test@example.com',
      user_metadata: { username: 'routeuser' },
      app_metadata: { role: 'user' }
    };
  });

  describe('GET /api/users/me', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authorization header with Bearer token required');
    });

    it('should return 200 with valid Bearer token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.id).toBe('user-456');
      expect(response.body.user.email).toBe('route-test@example.com');
    });

    it('should return correct user identity from token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.user).toEqual({
        id: 'user-456',
        email: 'route-test@example.com',
        username: 'routeuser',
        role: 'user'
      });
    });

    it('should return 403 with invalid token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' }
      });

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });
  });

  describe('GET /photos', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .get('/photos')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authorization header with Bearer token required');
    });

    it('should return 200 with valid Bearer token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      const response = await request(app)
        .get('/photos')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.userId).toBe('user-456');
    });

    it('should associate photos with authenticated user', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      const response = await request(app)
        .get('/photos')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      // Response should include user ID for authorization scoping
      expect(response.body.userId).toBe(testUser.id);
    });
  });

  describe('GET /photos/:id', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .get('/photos/123')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 200 with valid Bearer token', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      const response = await request(app)
        .get('/photos/123')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.photo.id).toBe('123');
    });
  });

  describe('Authorization Header Formats', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });
    });

    it('should accept "Bearer <token>" format', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer my-jwt-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject "bearer <token>" lowercase (per RFC)', async () => {
      // Note: Many implementations are case-insensitive, but we test the spec
      await request(app)
        .get('/api/users/me')
        .set('Authorization', 'bearer my-jwt-token')
        .expect(401);

      // If implementation is case-insensitive, this would be 200
      // Our implementation uses startsWith('Bearer ') which is case-sensitive
    });

    it('should reject "Basic <token>" format', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should correctly identify admin users', async () => {
      const adminUser = {
        ...testUser,
        app_metadata: { role: 'admin' }
      };
      
      mockGetUser.mockResolvedValue({
        data: { user: adminUser },
        error: null
      });

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.user.role).toBe('admin');
    });

    it('should default to user role when not specified', async () => {
      const noRoleUser = {
        ...testUser,
        app_metadata: {}
      };
      
      mockGetUser.mockResolvedValue({
        data: { user: noRoleUser },
        error: null
      });

      const response = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer user-token')
        .expect(200);

      expect(response.body.user.role).toBe('user');
    });
  });

  describe('Cross-Origin Requests with Bearer Token', () => {
    let corsApp;

    beforeEach(() => {
      const cors = require('cors');
      
      corsApp = express();
      corsApp.use(cors({
        origin: ['http://localhost:5173', 'https://react-photo-app.vercel.app'],
        credentials: true
      }));
      corsApp.use(cookieParser());
      corsApp.use(express.json());
      
      corsApp.get('/api/users/me', authenticateToken, (req, res) => {
        res.json({ success: true, user: req.user });
      });
    });

    it('should handle preflight request for Authorization header', async () => {
      const response = await request(corsApp)
        .options('/api/users/me')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization')
        .expect(204);

      // CORS should allow the Authorization header
      expect(response.headers['access-control-allow-headers']).toMatch(/authorization/i);
    });

    it('should process Bearer token after CORS preflight', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: testUser },
        error: null
      });

      const response = await request(corsApp)
        .get('/api/users/me')
        .set('Origin', 'http://localhost:5173')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});

describe('Image Endpoint Authentication', () => {
  let app;
  let testUser;

  beforeEach(() => {
    mockGetUser.mockReset();
    
    // Create Express app with image auth
    app = express();
    app.use(cookieParser());
    
    // Mock allowed origins with all exported functions
    const mockOrigins = ['http://localhost:5173'];
    jest.mock('../config/allowedOrigins', () => ({
      getAllowedOrigins: () => mockOrigins,
      resolveAllowedOrigin: (origin) => {
        if (!origin) return null;
        return mockOrigins.includes(origin) ? origin : null;
      },
      isOriginAllowed: (origin) => {
        if (!origin) return true;
        return mockOrigins.includes(origin);
      }
    }));
    
    // Use the actual imageAuth middleware
    const { authenticateImageRequest } = require('../middleware/imageAuth');
    
    app.get('/display/image/:id', authenticateImageRequest, (req, res) => {
      res.json({
        success: true,
        imageId: req.params.id,
        userId: req.user.id
      });
    });
    
    testUser = {
      id: 'image-user-123',
      email: 'image@example.com'
    };
  });

  it('should authenticate image requests with Bearer token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: testUser },
      error: null
    });

    const response = await request(app)
      .get('/display/image/456')
      .set('Origin', 'http://localhost:5173')
      .set('Authorization', 'Bearer image-access-token')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.imageId).toBe('456');
  });

  it('should return 401 for image requests without auth', async () => {
    const response = await request(app)
      .get('/display/image/456')
      .set('Origin', 'http://localhost:5173')
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Access token required for image access');
  });
});
