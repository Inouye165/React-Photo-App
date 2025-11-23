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

const { authenticateImageRequest } = require('../middleware/imageAuth');

describe('Image Authentication Middleware', () => {
  let app;
  const validToken = 'valid-supabase-token';

  beforeAll(() => {
    app = express();
    app.use(cookieParser());
    app.use('/test-image', authenticateImageRequest, (req, res) => {
      res.json({ success: true, user: req.user });
    });
  });

  beforeEach(() => {
    mockGetUser.mockReset();
  });

  test('should accept valid token supplied via Authorization header', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user1' } }, error: null });

    const response = await request(app)
      .get('/test-image')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.user.id).toBe('user1');
  });

  test('should reject request without token', async () => {
    const response = await request(app)
      .get('/test-image')
      .expect(401);

    expect(response.body.error).toBe('Access token required for image access');
  });

  test('should reject invalid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } });

    const response = await request(app)
      .get('/test-image')
      .set('Authorization', `Bearer invalid-token`)
      .expect(403);

    expect(response.body.error).toBe('Invalid token');
  });

  test('should reject malformed Authorization header', async () => {
    const response = await request(app)
      .get('/test-image')
      .set('Authorization', 'InvalidFormat token')
      .expect(401);

    expect(response.body.error).toBe('Access token required for image access');
  });
});
