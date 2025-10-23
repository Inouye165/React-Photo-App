const request = require('supertest');

// Mock knex before importing test-db
jest.mock('knex');
const mockKnex = require('./__mocks__/knex');
const { mockDbHelpers } = mockKnex;

const { createUser } = require('../middleware/auth');

// Test server setup
const express = require('express');
const createAuthRouter = require('../routes/auth');

describe('Authentication System', () => {
  let app;
  let db;

  beforeAll(async () => {
    // Use mocked database
    db = mockKnex;
    
    // Setup test app
    app = express();
    app.use(express.json());
    
    app.use(createAuthRouter({ db }));
  });

  afterAll(async () => {
    // Clean up mock data
    mockDbHelpers.clearMockData();
  });

  describe('User Registration', () => {
    test('should register a new user with valid data', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe(userData.username);
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.password_hash).toBeUndefined(); // Should not expose password
    });

    test('should reject registration with weak password', async () => {
      const userData = {
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'weak'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Validation failed');
    });

    test('should reject duplicate username', async () => {
      const userData = {
        username: 'testuser',
        email: 'different@example.com',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Username already exists');
    });

    test('should reject duplicate email', async () => {
      const userData = {
        username: 'differentuser',
        email: 'test@example.com',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email already registered');
    });
  });

  describe('User Login', () => {
    test('should login with valid credentials', async () => {
      const loginData = {
        username: 'testuser',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe(loginData.username);
      expect(response.body.token).toBeDefined();
    });

    test('should reject login with invalid credentials', async () => {
      const loginData = {
        username: 'testuser',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    test('should reject login with nonexistent user', async () => {
      const loginData = {
        username: 'nonexistentuser',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });
  });

  describe('Token Verification', () => {
    let validToken;

    beforeAll(async () => {
      // Get a valid token by logging in
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          username: 'testuser',
          password: 'TestPassword123!'
        });
      
      validToken = loginResponse.body.token;
    });

    test('should verify valid token', async () => {
      const response = await request(app)
        .post('/auth/verify')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.username).toBe('testuser');
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .post('/auth/verify')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access token required');
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .post('/auth/verify')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });
  });

  describe('Account Lockout', () => {
    beforeAll(async () => {
      // Create a test user for lockout testing
      await createUser(db, {
        username: 'lockouttest',
        email: 'lockout@example.com',
        password: 'TestPassword123!',
        role: 'user'
      });
    });

    test('should lock account after multiple failed attempts', async () => {
      const loginData = {
        username: 'lockouttest',
        password: 'wrongpassword'
      };

      // Make 4 failed login attempts (should get 401)
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/auth/login')
          .send(loginData)
          .expect(401);
      }

      // The 5th attempt should result in account lockout (423)
      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(423);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Account locked');
    });

    test('should prevent login even with correct password when locked', async () => {
      const loginData = {
        username: 'lockouttest',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(423);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Account is locked');
    });
  });

  describe('Input Validation', () => {
    test('should reject registration with missing fields', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser3'
          // Missing email and password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'testuser'
          // Missing password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should reject invalid email format', async () => {
      const userData = {
        username: 'testuser4',
        email: 'invalid-email',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    test('should reject username with invalid characters', async () => {
      const userData = {
        username: 'test user!', // Contains space and special char
        email: 'test4@example.com',
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });
});

module.exports = {};