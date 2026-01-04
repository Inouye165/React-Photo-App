/**
 * Integration tests for GET /photos/:id/original
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-photos-original';
process.env.THUMBNAIL_SIGNING_SECRET = 'test-thumbnail-signing-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

const createPhotosRouter = require('../routes/photos');

function makeToken(userId) {
  return jwt.sign(
    {
      id: userId,
      email: 'photos-original@test.com',
      sub: userId,
      username: 'photos-original-test',
      role: 'user',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function buildApp({ dbRow, signedUrl }) {
  const db = jest.fn(() => {
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(dbRow),
    };
    return query;
  });

  const supabase = {
    storage: {
      from: () => ({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: signedUrl ? { signedUrl } : null,
          error: signedUrl ? null : { message: 'no signed url' },
        }),
      }),
    },
  };

  const app = express();
  app.use('/photos', createPhotosRouter({ db, supabase }));
  return app;
}

describe('GET /photos/:id/original', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const token = makeToken(userId);
  const photoId = '22222222-2222-4222-8222-222222222222';

  test('302 redirects to signed URL with download filename', async () => {
    const app = buildApp({
      dbRow: {
        id: photoId,
        user_id: userId,
        original_path: `original/${photoId}/IMG_0001.HEIC`,
        storage_path: null,
        original_filename: 'IMG 0001.HEIC',
        filename: 'ignored.jpg',
      },
      signedUrl: 'https://storage.example.test/object?token=abc',
    });

    const res = await request(app)
      .get(`/photos/${photoId}/original`)
      .set('Authorization', `Bearer ${token}`)
      .expect(302);

    expect(res.headers.location).toContain('https://storage.example.test/object');
    const redirected = new URL(res.headers.location);
    expect(redirected.searchParams.get('download')).toBe('IMG 0001.HEIC');
  });

  test('404 when photo not found for user', async () => {
    const app = buildApp({
      dbRow: null,
      signedUrl: 'https://storage.example.test/object?token=abc',
    });

    const res = await request(app)
      .get(`/photos/${photoId}/original`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(res.body.success).toBe(false);
  });

  test('409 when original path is missing', async () => {
    const app = buildApp({
      dbRow: {
        id: photoId,
        user_id: userId,
        original_path: null,
        storage_path: null,
        original_filename: 'x.heic',
        filename: 'x.heic',
      },
      signedUrl: 'https://storage.example.test/object?token=abc',
    });

    const res = await request(app)
      .get(`/photos/${photoId}/original`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(String(res.body.error || '')).toMatch(/original not available/i);
  });
});
