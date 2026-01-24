/* eslint-env jest */

/// <reference path="./jest-globals.d.ts" />

export {};

process.env.NODE_ENV = 'test';
process.env.E2E_ROUTES_ENABLED = 'true';
process.env.JWT_SECRET = 'test-jwt-secret-versioning';
process.env.THUMBNAIL_SIGNING_SECRET = 'test-thumbnail-signing-secret';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../services/photosDb', () => {
  return function createPhotosDb() {
    return {
      listPhotos: jest.fn(async () => [
        {
          id: 1,
          filename: 'p1.jpg',
          state: 'finished',
          created_at: '2025-01-01T00:00:00.000Z',
          metadata: {},
          hash: 'h1',
          file_size: 1,
        },
      ]),
    };
  };
});

const { registerRoutes } = require('../bootstrap/registerRoutes');

function buildApp() {
  const app = express();
  const fakeDb = () => {
    throw new Error('DB should not be called in versioning tests');
  };
  const fakeSupabase = {
    storage: {
      from: () => ({
        createSignedUrl: jest.fn(),
      }),
    },
  };
  const fakeSocketManager = {
    addClient: jest.fn(),
    removeClient: jest.fn(),
    send: jest.fn(),
  };

  registerRoutes(app, { db: fakeDb, supabase: fakeSupabase, socketManager: fakeSocketManager });
  return app;
}

function createE2eToken() {
  const testUserId = '11111111-1111-4111-8111-111111111111';
  return jwt.sign(
    {
      sub: testUserId,
      id: testUserId,
      email: 'versioning@test.com',
      username: 'versioning-test',
      role: 'user',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('API versioning v1 aliases', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(() => {
    app = buildApp();
  });

  test('auth session works on legacy and v1', async () => {
    const legacyRes = await request(app)
      .post('/api/auth/session')
      .set('Origin', 'http://localhost:5173')
      .send({});

    expect(legacyRes.status).toBe(200);
    expect(legacyRes.headers.deprecation).toBe('true');
    expect(legacyRes.headers.link).toContain('/api/v1/auth');

    const v1Res = await request(app)
      .post('/api/v1/auth/session')
      .set('Origin', 'http://localhost:5173')
      .send({});

    expect(v1Res.status).toBe(200);
    expect(v1Res.headers.deprecation).toBeUndefined();
  });

  test('photos list works on legacy and v1', async () => {
    const token = createE2eToken();

    const legacyRes = await request(app)
      .get('/photos')
      .set('Authorization', `Bearer ${token}`);

    expect(legacyRes.status).toBe(200);
    expect(legacyRes.body.success).toBe(true);
    expect(legacyRes.headers.deprecation).toBe('true');
    expect(legacyRes.headers.link).toContain('/api/v1/photos');

    const v1Res = await request(app)
      .get('/api/v1/photos')
      .set('Authorization', `Bearer ${token}`);

    expect(v1Res.status).toBe(200);
    expect(v1Res.body.success).toBe(true);
    expect(v1Res.headers.deprecation).toBeUndefined();
  });

  test('display thumbnails respond on legacy and v1', async () => {
    const legacyRes = await request(app)
      .get('/display/thumbnails/abc.jpg?sig=invalid&exp=1');

    expect(legacyRes.status).toBe(403);
    expect(legacyRes.headers.deprecation).toBe('true');
    expect(legacyRes.headers.link).toContain('/api/v1/display');

    const v1Res = await request(app)
      .get('/api/v1/display/thumbnails/abc.jpg?sig=invalid&exp=1');

    expect(v1Res.status).toBe(403);
    expect(v1Res.headers.deprecation).toBeUndefined();
  });

  test('events endpoint responds on legacy and v1', async () => {
    const legacyRes = await request(app).get('/events/photos');

    expect(legacyRes.status).toBe(401);
    expect(legacyRes.headers.deprecation).toBe('true');
    expect(legacyRes.headers.link).toContain('/api/v1/events');

    const v1Res = await request(app).get('/api/v1/events/photos');

    expect(v1Res.status).toBe(401);
    expect(v1Res.headers.deprecation).toBeUndefined();
  });

  test('uploads remain protected on legacy and v1', async () => {
    const legacyRes = await request(app).post('/upload');

    expect(legacyRes.status).toBe(401);
    expect(legacyRes.headers.deprecation).toBe('true');
    expect(legacyRes.headers.link).toContain('/api/v1/upload');

    const v1Res = await request(app).post('/api/v1/upload');

    expect(v1Res.status).toBe(401);
    expect(v1Res.headers.deprecation).toBeUndefined();
  });
});
