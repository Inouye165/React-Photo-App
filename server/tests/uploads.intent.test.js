/**
 * Integration test for intent-based uploads.
 * Verifies multipart field `classification` is persisted on the inserted photo row.
 */
/* eslint-env jest */

// Mock Supabase before any modules are imported
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
const { mockStorageHelpers } = require('./__mocks__/supabase');

// Mock the queue module to prevent Redis connection attempts
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  checkRedisAvailable: jest.fn().mockResolvedValue(false)
}));

const request = require('supertest');
const express = require('express');

const createUploadsRouter = require('../routes/uploads');

// Stateful mock DB that supports inserting and querying photos
const createMockDb = () => {
  const photosById = new Map();
  let nextId = 1;

  const findByHash = (hash) => {
    for (const row of photosById.values()) {
      if (row && row.hash === hash) return row;
    }
    return null;
  };

  const mockKnex = jest.fn((tableName) => {
    if (tableName !== 'photos') {
      return {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 1 }])
      };
    }

    return {
      where: jest.fn((criteria = {}) => {
        const whereApi = {
          select: jest.fn((_cols) => ({
            first: jest.fn().mockImplementation(async () => {
              if (criteria && typeof criteria === 'object' && 'hash' in criteria) {
                const match = findByHash(criteria.hash);
                return match ? { id: match.id } : null;
              }
              if (criteria && typeof criteria === 'object' && 'id' in criteria) {
                const row = photosById.get(criteria.id) || null;
                return row;
              }
              return null;
            })
          })),
          first: jest.fn().mockImplementation(async () => {
            if (criteria && typeof criteria === 'object' && 'hash' in criteria) {
              return findByHash(criteria.hash);
            }
            if (criteria && typeof criteria === 'object' && 'id' in criteria) {
              return photosById.get(criteria.id) || null;
            }
            return null;
          }),
          update: jest.fn().mockResolvedValue(1)
        };
        return whereApi;
      }),
      insert: jest.fn((data) => ({
        returning: jest.fn().mockImplementation(async (_fields) => {
          const id = nextId++;
          const record = { ...data, id };
          photosById.set(id, record);
          return [{
            id,
            filename: data.filename,
            hash: data.hash,
            storage_path: data.storage_path
          }];
        })
      })),
      select: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null)
      }))
    };
  });

  return mockKnex;
};

describe('Uploads Router - Intent-Based Uploads', () => {
  let app;
  let mockDb;

  const minimalJpegBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x00, 0xFF, 0xD9
  ]);

  beforeEach(() => {
    mockDb = createMockDb();

    app = express();
    app.use(express.json());

    // Auth middleware
    app.use('/uploads', (req, _res, next) => {
      req.user = { id: 1, email: 'test@example.com' };
      next();
    });

    app.use('/uploads', createUploadsRouter({ db: mockDb }));

    mockStorageHelpers.clearMockStorage();
    jest.clearAllMocks();
  });

  it('persists classification intent from multipart field', async () => {
    const response = await request(app)
      .post('/uploads/upload')
      .field('classification', 'collectible')
      .attach('photo', minimalJpegBuffer, 'photo.jpg');

    expect([200, 202]).toContain(response.status);
    expect(response.body).toBeTruthy();
    expect(response.body.success).toBe(true);
    expect(response.body.photoId).toBeDefined();

    const inserted = await mockDb('photos')
      .where({ id: response.body.photoId, user_id: 1 })
      .first();

    expect(inserted).toBeTruthy();
    expect(inserted.classification).toBe('collectible');
  });
});
