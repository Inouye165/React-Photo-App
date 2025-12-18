/**
 * Privacy-by-default: GPS coordinates are not persisted unless explicitly enabled.
 */
/* eslint-env jest */

jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());

// Mock queue functions
jest.mock('../queue/index', () => ({
  addAIJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  checkRedisAvailable: jest.fn().mockResolvedValue(false)
}));

// Force metadata extraction to return GPS coords + direction
jest.mock('../media/backgroundProcessor', () => ({
  extractMetadata: jest.fn().mockResolvedValue({
    latitude: 47.6205,
    longitude: -122.3493,
    GPSLatitude: 47.6205,
    GPSLongitude: -122.3493,
    gps: { lat: 47.6205, lon: -122.3493, direction: 123.4 },
    GPS: { latitude: 47.6205, longitude: -122.3493, imgDirection: 123.4 },
    GPSImgDirection: 123.4
  })
}));

const request = require('supertest');
const express = require('express');

const createUploadsRouter = require('../routes/uploads');

const minimalJpegBuffer = Buffer.from([
  0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10,
  0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0xFF, 0xD9
]);

const createStatefulDb = () => {
  const photosById = new Map();
  let nextId = 1;

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
        return {
          select: jest.fn(() => ({
            first: jest.fn().mockImplementation(async () => {
              if (criteria && typeof criteria === 'object' && 'id' in criteria) {
                return photosById.get(criteria.id) || null;
              }
              return null;
            })
          })),
          first: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue(1)
        };
      }),
      insert: jest.fn((data) => ({
        returning: jest.fn().mockImplementation(async (_fields) => {
          const id = nextId++;
          photosById.set(id, { ...data, id });
          return [{ id, filename: data.filename, hash: data.hash, storage_path: data.storage_path }];
        })
      })),
      select: jest.fn(() => ({
        first: jest.fn().mockResolvedValue(null)
      }))
    };
  });

  mockKnex.__photosById = photosById;
  return mockKnex;
};

describe('Uploads - GPS privacy', () => {
  let app;
  let db;

  beforeEach(() => {
    db = createStatefulDb();

    app = express();
    app.use(express.json());

    app.use('/uploads', (req, _res, next) => {
      req.user = { id: 1, email: 'test@example.com' };
      next();
    });

    app.use('/uploads', createUploadsRouter({ db }));
  });

  afterEach(() => {
    delete process.env.STORE_GPS_COORDS;
  });

  it('does not persist GPS coordinates by default, but preserves direction', async () => {
    delete process.env.STORE_GPS_COORDS;

    const res = await request(app)
      .post('/uploads/upload')
      .attach('photo', minimalJpegBuffer, { filename: 'gps.jpg', contentType: 'image/jpeg' });

    expect([200, 202]).toContain(res.status);
    expect(res.body.success).toBe(true);

    const inserted = db.__photosById.get(res.body.photoId);
    expect(inserted).toBeTruthy();

    const stored = JSON.parse(inserted.metadata);

    expect(stored.latitude).toBeUndefined();
    expect(stored.longitude).toBeUndefined();
    expect(stored.GPSLatitude).toBeUndefined();
    expect(stored.GPSLongitude).toBeUndefined();
    expect(stored.gps).toBeUndefined();
    expect(stored.GPS).toBeUndefined();

    // Direction is allowed to remain
    expect(stored.GPSImgDirection).toBe(123.4);
  });
});
