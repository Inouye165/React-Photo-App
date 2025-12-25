/**
 * Integration coverage for centralized validation + DTO mapping:
 * - invalid UUID param returns 400 deterministic envelope
 * - list success includes expected keys and parsed JSON-ish fields are typed
 */

process.env.NODE_ENV = 'test';
process.env.E2E_ROUTES_ENABLED = 'true';
process.env.JWT_SECRET = 'test-jwt-secret-photos-validation';
process.env.THUMBNAIL_SIGNING_SECRET = 'test-thumbnail-signing-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

jest.mock('../services/photosDb', () => {
  return function createPhotosDb() {
    return {
      listPhotos: jest.fn(async () => {
        return [
          {
            id: 1,
            filename: 'p1.jpg',
            state: 'finished',
            created_at: '2025-12-24T12:00:00.000Z',
            metadata: '{"width":100,"height":200}',
            hash: 'h1',
            file_size: 1,
            caption: null,
            description: null,
            keywords: null,
            classification: 'scenery',
            text_style: '{"font":"Arial"}',
            ai_model_history: '{"models":["gpt-5"]}',
            poi_analysis: '{"name":"POI"}',
          },
        ];
      }),
      getPhotoById: jest.fn(async () => {
        return {
          id: 2,
          filename: 'p2.jpg',
          state: 'finished',
          metadata: '{"iso":100}',
          hash: 'h2',
          file_size: 2,
          caption: 'cap',
          description: 'desc',
          keywords: 'k1,k2',
          classification: 'scenery',
          text_style: '{"size":12}',
          ai_model_history: '{"models":["gpt-5"]}',
          poi_analysis: '{"confidence":0.9}',
          edited_filename: null,
          storage_path: null,
        };
      }),
      updatePhotoMetadata: jest.fn(async () => true),
    };
  };
});

const createPhotosRouter = require('../routes/photos');

function buildApp() {
  const app = express();
  const fakeDb = () => {
    throw new Error('DB should not be used in integration validation test');
  };
  const fakeSupabase = { storage: { from: () => ({}) } };
  app.use('/photos', createPhotosRouter({ db: fakeDb, supabase: fakeSupabase }));
  return app;
}

describe('photos routes validation + mapping', () => {
  let app;
  let testUserId;
  let testToken;

  beforeAll(() => {
    app = buildApp();
    testUserId = '11111111-1111-4111-8111-111111111111';
    testToken = jwt.sign(
      {
        id: testUserId,
        email: 'photos-validation@test.com',
        sub: testUserId,
        username: 'photos-validation-test',
        role: 'user',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  test('GET /photos/:id rejects invalid UUID with deterministic envelope', async () => {
    const response = await request(app)
      .get('/photos/not-a-uuid')
      .set('Authorization', `Bearer ${testToken}`)
      .set('x-request-id', 'req-invalid-photo-id')
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid photo id',
        requestId: 'req-invalid-photo-id',
      },
    });
  });

  test('GET /photos success returns expected keys and parsed JSON-ish types', async () => {
    const response = await request(app)
      .get('/photos')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.photos)).toBe(true);
    expect(response.body.photos.length).toBeGreaterThan(0);

    const photo = response.body.photos[0];
    expect(photo).toHaveProperty('id');
    expect(photo).toHaveProperty('metadata');
    expect(typeof photo.metadata).toBe('object');
    expect(photo.metadata).toHaveProperty('width', 100);

    expect(photo).toHaveProperty('textStyle');
    expect(photo.textStyle).toEqual({ font: 'Arial' });

    expect(photo).toHaveProperty('aiModelHistory');
    expect(photo.aiModelHistory).toEqual({ models: ['gpt-5'] });

    expect(photo).toHaveProperty('poi_analysis');
    expect(photo.poi_analysis).toEqual({ name: 'POI' });
  });

  test('PATCH /photos/:id/metadata rejects invalid UUID with deterministic envelope', async () => {
    const response = await request(app)
      .patch('/photos/not-a-uuid/metadata')
      .set('Authorization', `Bearer ${testToken}`)
      .set('x-request-id', 'req-invalid-photo-metadata-id')
      .send({ caption: 'new cap' })
      .expect(400);

    expect(response.body).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid photo id',
        requestId: 'req-invalid-photo-metadata-id',
      },
    });
  });

  test('PATCH /photos/:id/metadata rejects empty body with 422 deterministic envelope', async () => {
    const validId = '22222222-2222-4222-8222-222222222222';
    const response = await request(app)
      .patch(`/photos/${validId}/metadata`)
      .set('Authorization', `Bearer ${testToken}`)
      .set('x-request-id', 'req-invalid-photo-metadata-body')
      .send({})
      .expect(422);

    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        requestId: 'req-invalid-photo-metadata-body',
      },
    });
  });

  test('PATCH /photos/:id/metadata success returns updated metadata shape', async () => {
    const validId = '33333333-3333-4333-8333-333333333333';
    const response = await request(app)
      .patch(`/photos/${validId}/metadata`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ caption: 'new cap', textStyle: { font: 'Arial' } })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      metadata: {
        caption: 'new cap',
        description: 'desc',
        keywords: 'k1,k2',
        textStyle: { font: 'Arial' },
      },
    });
  });
});
