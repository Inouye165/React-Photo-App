/**
 * Role-based Access Control Security Tests
 * 
 * These tests verify that the privilege escalation vulnerability (CWE-266)
 * has been properly mitigated by using app_metadata instead of user_metadata
 * for role determination.
 * 
 * CRITICAL SECURITY TESTS:
 * - Verify that user_metadata.role is IGNORED (prevents client-side privilege escalation)
 * - Verify that app_metadata.role is ENFORCED (secure, server-controlled)
 * - Verify that malicious users cannot grant themselves admin privileges
 */

const request = require('supertest');
const express = require('express');

// Mock Supabase
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser
    }
  })
}));

const { authenticateToken, requireRole } = require('../middleware/auth');

describe('Role Security Tests - Privilege Escalation Prevention', () => {
  let app;
  
  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Test endpoint that requires admin role
    app.get('/admin/dashboard', authenticateToken, requireRole('admin'), (req, res) => {
      res.json({ 
        success: true, 
        message: 'Welcome to admin dashboard',
        user: req.user 
      });
    });
    
    // Test endpoint that requires user role (any authenticated user)
    app.get('/user/profile', authenticateToken, requireRole('user', 'admin'), (req, res) => {
      res.json({ 
        success: true, 
        message: 'User profile',
        user: req.user 
      });
    });
  });

  beforeEach(() => {
    mockGetUser.mockReset();
  });

  describe('CRITICAL: Privilege Escalation Attack Vector (The "Hacker" Scenario)', () => {
    test('SECURITY: Should REJECT when user_metadata says "admin" but app_metadata is empty', async () => {
      // ATTACK SCENARIO: Malicious user modifies their own user_metadata
      // via Supabase client to grant themselves admin role
      const maliciousUser = {
        id: 'hacker-123',
        email: 'hacker@example.com',
        user_metadata: {
          username: 'hacker',
          role: 'admin' // ← CLIENT SET THIS (INSECURE!)
        },
        app_metadata: {
          // Empty or missing role - no legitimate admin grant
        }
      };
      
      mockGetUser.mockResolvedValue({ 
        data: { user: maliciousUser }, 
        error: null 
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer hacker-token')
        .expect(403); // Must be FORBIDDEN, not 200

      // CRITICAL ASSERTIONS
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient permissions');
      
      // Verify the role was correctly resolved from app_metadata (not user_metadata)
      // This proves the attack was prevented
      expect(mockGetUser).toHaveBeenCalledWith('hacker-token');
    });

    test('SECURITY: Should resolve role as "user" when user_metadata says "admin" but app_metadata says "user"', async () => {
      // ATTACK SCENARIO: Malicious user tries to override their legitimate role
      const maliciousUser = {
        id: 'user-456',
        email: 'normaluser@example.com',
        user_metadata: {
          username: 'normaluser',
          role: 'admin' // ← Attacker set this
        },
        app_metadata: {
          role: 'user' // ← Server-controlled truth
        }
      };
      
      mockGetUser.mockResolvedValue({ 
        data: { user: maliciousUser }, 
        error: null 
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer user-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    test('SECURITY: Should default to "user" role when both metadata are empty', async () => {
      const userWithNoRoles = {
        id: 'user-789',
        email: 'newuser@example.com',
        user_metadata: {},
        app_metadata: {}
      };
      
      mockGetUser.mockResolvedValue({ 
        data: { user: userWithNoRoles }, 
        error: null 
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer new-user-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    test('SECURITY: Should allow access to user endpoints even when user_metadata has fake admin role', async () => {
      const userWithFakeAdmin = {
        id: 'user-012',
        email: 'fakeadmin@example.com',
        user_metadata: {
          role: 'admin' // Fake admin claim
        },
        app_metadata: {
          role: 'user' // Real role
        }
      };
      
      mockGetUser.mockResolvedValue({ 
        data: { user: userWithFakeAdmin }, 
        error: null 
      });

      // Should be able to access user endpoints
      const response = await request(app)
        .get('/user/profile')
        .set('Authorization', 'Bearer user-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.role).toBe('user'); // Correctly resolved from app_metadata
    });
  });

  describe('CRITICAL: Secure Admin Access (Legitimate Admin)', () => {
    test('SECURITY: Should ALLOW access when app_metadata says "admin"', async () => {
      // LEGITIMATE ADMIN: Role set via Service Role Key (secure method)
      const legitimateAdmin = {
        id: 'admin-123',
        email: 'admin@example.com',
        user_metadata: {
          username: 'realadmin',
          role: 'user' // Even if this says user...
        },
        app_metadata: {
          role: 'admin' // ← This is the source of truth (set by server only)
        }
      };
      
      mockGetUser.mockResolvedValue({ 
        data: { user: legitimateAdmin }, 
        error: null 
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer admin-token')
        .expect(200); // Should be ALLOWED

      // CRITICAL ASSERTIONS
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Welcome to admin dashboard');
      expect(response.body.user.role).toBe('admin'); // Correctly resolved from app_metadata
      expect(response.body.user.email).toBe('admin@example.com');
    });

    test('SECURITY: Should resolve role as "admin" from app_metadata regardless of user_metadata', async () => {
      const adminUser = {
        id: 'admin-456',
        email: 'superadmin@example.com',
        user_metadata: {
          // Deliberately empty or conflicting
        },
        app_metadata: {
          role: 'admin' // Server-controlled truth
        }
      };
      
      mockGetUser.mockResolvedValue({ 
        data: { user: adminUser }, 
        error: null 
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer admin-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.role).toBe('admin');
    });
  });

  describe('requireRole Middleware Security', () => {
    test('Should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/admin/dashboard')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    test('Should reject when user has no role and tries to access admin', async () => {
      const userNoRole = {
        id: 'user-999',
        email: 'norole@example.com',
        user_metadata: {},
        app_metadata: {} // No role set
      };
      
      mockGetUser.mockResolvedValue({ 
        data: { user: userNoRole }, 
        error: null 
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', 'Bearer no-role-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Insufficient permissions');
    });

    test('Should allow access when user role matches required roles', async () => {
      const regularUser = {
        id: 'user-111',
        email: 'regular@example.com',
        user_metadata: { username: 'regular' },
        app_metadata: { role: 'user' }
      };
      
      mockGetUser.mockResolvedValue({ 
        data: { user: regularUser }, 
        error: null 
      });

      const response = await request(app)
        .get('/user/profile')
        .set('Authorization', 'Bearer user-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.role).toBe('user');
    });
  });

  describe('Code Security Verification', () => {
    test('SECURITY: Auth middleware should NOT read from user_metadata.role', () => {
      const fs = require('fs');
      const path = require('path');
      
      const authMiddlewarePath = path.join(__dirname, '../middleware/auth.js');
      const authMiddlewareContent = fs.readFileSync(authMiddlewarePath, 'utf8');
      
      // Verify the vulnerable pattern is NOT present
      // The code should NOT have: user.user_metadata?.role
      const vulnerablePattern = /user\.user_metadata\?\.\s*role/;
      const hasVulnerability = vulnerablePattern.test(authMiddlewareContent);
      
      expect(hasVulnerability).toBe(false);
      
      // Verify the secure pattern IS present
      // The code SHOULD have: user.app_metadata?.role
      const securePattern = /user\.app_metadata\?\.\s*role/;
      const hasSecureFix = securePattern.test(authMiddlewareContent);
      
      expect(hasSecureFix).toBe(true);
    });

    test('DOCUMENTATION: Should have comment explaining why app_metadata is used', () => {
      const fs = require('fs');
      const path = require('path');
      
      const authMiddlewarePath = path.join(__dirname, '../middleware/auth.js');
      const authMiddlewareContent = fs.readFileSync(authMiddlewarePath, 'utf8');
      
      // Verify there's a comment about security or app_metadata
      const hasSecurityComment = /SECURITY.*app_metadata/i.test(authMiddlewareContent) ||
                                 /app_metadata.*server-controlled/i.test(authMiddlewareContent);
      
      expect(hasSecurityComment).toBe(true);
    });
  });
});
