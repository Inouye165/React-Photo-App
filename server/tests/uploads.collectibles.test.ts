/* eslint-env jest */

/**
 * Collectible upload pipeline integration tests.
 *
 * Goals:
 * - Uploading with collectible_id enqueues a queue job.
 * - Worker always generates derivatives, but skips AI when runAiAnalysis=false.
 * - Collectible photo listing returns signed thumbnail URLs (browser compatible).
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Shared fixture
const TEST_FIXTURE_PATH = path.join(os.tmpdir(), 'test-fixture-collectible-upload.jpg');
const minimalJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0,
  0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01,
  0xff, 0xd9
]);

// Supabase mocks (used by the streaming upload router)
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabaseClient', () => require('./__mocks__/supabase').createClient());
const { mockStorageHelpers } = require('./__mocks__/supabase');

describe('Collectible upload pipeline', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    try {
      fs.writeFileSync(TEST_FIXTURE_PATH, minimalJpegBuffer);
    } catch {
      // ignore
    }

    mockStorageHelpers.clearMockStorage();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(TEST_FIXTURE_PATH)) fs.unlinkSync(TEST_FIXTURE_PATH);
    } catch {
      // ignore
    }
  });

  test('upload with collectible_id enqueues job with runAiAnalysis=false', async () => {
    const addAIJob = jest.fn().mockResolvedValue({ id: 'mock-job-id' });
    const checkRedisAvailable = jest.fn().mockResolvedValue(true);

    jest.doMock('../queue/index', () => ({
      addAIJob,
      checkRedisAvailable,
    }));

    const createUploadsRouter = require('../routes/uploads');
    const publishToUser = jest.fn();
    const socketManager = { publishToUser };

    // Minimal DB mock for uploads.js
    const photos = new Map();
    let nextPhotoId = 1;

    const mockDb = jest.fn((tableName) => {
      if (tableName === 'photos') {
        return {
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(null),
            }),
            update: jest.fn().mockImplementation(async (updates) => {
              // best-effort update for inserted photo
              const id = updates && updates.id ? updates.id : undefined;
              if (typeof id === 'number' && photos.has(id)) {
                photos.set(id, { ...photos.get(id), ...updates });
              }
              return 1;
            }),
          }),
          insert: jest.fn().mockReturnValue({
            returning: jest.fn().mockImplementation(async () => {
              const id = nextPhotoId++;
              const record = {
                id,
                filename: `test-${id}.jpg`,
                hash: 'mock-hash',
                storage_path: `working/test-${id}.jpg`,
              };
              photos.set(id, record);
              return [record];
            }),
          }),
        };
      }

      if (tableName === 'collectibles') {
        return {
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue({ id: 1, user_id: 1 }),
            }),
          }),
        };
      }

      return {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([{ id: 1 }]),
      };
    });

    const app = express();
    app.use('/uploads', (req, _res, next) => {
      req.user = { id: 1, username: 'testuser' };
      req.requestId = 'test-request-id';
      next();
    });
    app.use('/uploads', createUploadsRouter({ db: mockDb, socketManager }));

    const res = await request(app)
      .post('/uploads/upload?collectible_id=1')
      .set('Authorization', 'Bearer valid-token')
      .attach('photo', TEST_FIXTURE_PATH);

    expect(res.status).toBe(202);
    expect(addAIJob).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        generateThumbnail: true,
        processMetadata: true,
        runAiAnalysis: false,
      })
    );

    expect(publishToUser).toHaveBeenCalledWith(
      '1',
      'collectible.photos.changed',
      expect.objectContaining({
        collectibleId: '1',
        photoId: expect.any(String),
        createdAt: expect.any(String),
      })
    );
  });

  test('worker runs processUploadedPhoto but skips updatePhotoAIMetadata when runAiAnalysis=false', async () => {
    process.env.REDIS_URL = 'redis://example.test:6379';

    // Ensure we use the real queue module in this test (a previous test mocks ../queue/index).
    jest.unmock('../queue');
    jest.unmock('../queue/index');

    const processUploadedPhoto = jest.fn(async (db, photoId) => {
      await db('photos').where({ id: photoId }).update({
        thumb_path: 'thumbnails/abc.webp',
        thumb_small_path: 'thumbnails/abc-sm.webp',
        display_path: 'display/1/1.webp',
        display_mime: 'image/webp',
      });
    });

    const updatePhotoAIMetadata = jest.fn();
    const ensureHeicDisplayAsset = jest.fn();

    let capturedProcessor;

    jest.doMock('bullmq', () => {
      return {
        Queue: class MockQueue {
          constructor() {}
          add() {
            return { id: 'job-1' };
          }
        },
        Worker: class MockWorker {
          constructor(_name, processor) {
            capturedProcessor = processor;
            this._listeners = {};
          }
          on(event, fn) {
            this._listeners[event] = fn;
          }
          close() {
            return Promise.resolve();
          }
        },
      };
    });

    jest.doMock('../redis/connection', () => {
      return {
        createRedisConnection: () => ({
          ping: () => Promise.resolve('PONG'),
          publish: () => Promise.resolve(1),
          disconnect: () => {},
          on: () => {},
        }),
      };
    });

    // Minimal in-memory DB mock for worker.
    const photos = new Map([
      [
        1,
        {
          id: 1,
          user_id: 1,
          filename: 'ref.heic',
          state: 'working',
          storage_path: 'original/1/ref.heic',
          display_path: null,
        },
      ],
    ]);

    const db = jest.fn((tableName) => {
      if (tableName !== 'photos') throw new Error(`Unexpected table: ${tableName}`);

      return {
        where: ({ id }) => {
          return {
            first: async () => photos.get(id) || null,
            select: () => ({
              first: async () => photos.get(id) || null,
            }),
            update: async (updates) => {
              const existing = photos.get(id);
              photos.set(id, { ...(existing || {}), ...updates });
              return 1;
            },
          };
        },
      };
    });

    jest.doMock('../db', () => db, { virtual: true });
    jest.doMock('../db/index', () => db, { virtual: true });

    jest.doMock('../ai/service', () => ({ updatePhotoAIMetadata }));
    jest.doMock('../media/backgroundProcessor', () => ({ processUploadedPhoto }));
    jest.doMock('../media/heicDisplayAsset', () => ({ ensureHeicDisplayAsset }));

    jest.doMock('../lib/supabaseClient', () => ({
      storage: {
        from: () => ({}),
      },
    }));

    jest.doMock('../services/photosStorage', () => () => ({
      deletePhotos: jest.fn(),
      listPhotos: jest.fn(),
      downloadPhoto: jest.fn(),
    }));

    jest.doMock('../services/photosState', () => () => ({
      transitionState: jest.fn(),
    }));

    const { startWorker } = require('../queue');
    await startWorker();

    expect(typeof capturedProcessor).toBe('function');

    await capturedProcessor({
      id: 'job-1',
      name: 'process-photo-ai',
      data: {
        photoId: 1,
        processMetadata: true,
        generateThumbnail: true,
        runAiAnalysis: false,
      },
      opts: { attempts: 1 },
      attemptsMade: 0,
    });

    expect(processUploadedPhoto).toHaveBeenCalledWith(
      db,
      1,
      expect.objectContaining({
        generateDisplay: true,
        generateThumbnail: true,
        processMetadata: true,
      })
    );

    expect(updatePhotoAIMetadata).not.toHaveBeenCalled();
    expect(photos.get(1)?.display_path).toBe('display/1/1.webp');
  });

  test('collectible photos endpoint returns signed thumbnail URLs when thumb paths exist', async () => {
    const createCollectiblesRouter = require('../routes/collectibles');

    const mockDb = jest.fn((tableName) => {
      if (tableName === 'collectibles') {
        return {
          where: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue({ id: 1 }),
            }),
          }),
        };
      }

      if (tableName === 'photos') {
        return {
          select: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue([
                  {
                    id: 10,
                    filename: 'ref.jpg',
                    state: 'working',
                    metadata: '{}',
                    hash: 'abc',
                    file_size: 1,
                    caption: null,
                    description: null,
                    keywords: null,
                    classification: 'collectible',
                    storage_path: 'original/10/ref.jpg',
                    edited_filename: null,
                    text_style: null,
                    ai_model_history: null,
                    poi_analysis: null,
                    thumb_path: 'thumbnails/abc.webp',
                    thumb_small_path: 'thumbnails/abc-sm.webp',
                  },
                ]),
              }),
            }),
          }),
        };
      }

      return {};
    });

    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: 1 };
      next();
    });
    app.use(createCollectiblesRouter({ db: mockDb }));

    const res = await request(app).get('/collectibles/1/photos');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const photos = Array.isArray(res.body.photos) ? res.body.photos : [];
    expect(photos.length).toBeGreaterThan(0);

    expect(photos[0].thumbnail).toContain('/display/thumbnails/abc.webp');
    expect(photos[0].thumbnail).toContain('sig=');
    expect(photos[0].thumbnail).toContain('exp=');
    expect(photos[0].thumbnailUrl).toContain('/display/thumbnails/abc.webp');
    expect(photos[0].thumbnailUrl).toContain('sig=');
    expect(photos[0].thumbnailUrl).toContain('exp=');

    expect(photos[0].smallThumbnail).toContain('/display/thumbnails/abc-sm.webp');
    expect(photos[0].smallThumbnail).toContain('sig=');
    expect(photos[0].smallThumbnail).toContain('exp=');
    expect(photos[0].smallThumbnailUrl).toContain('/display/thumbnails/abc-sm.webp');
    expect(photos[0].smallThumbnailUrl).toContain('sig=');
    expect(photos[0].smallThumbnailUrl).toContain('exp=');
  });
});
