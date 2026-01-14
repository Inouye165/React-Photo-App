/**
 * Integration tests for secure photo deletion:
 * - Happy path: deletes storage objects then removes DB row
 * - Ownership: non-owner cannot delete
 * - Abort safety: if storage deletion fails, DB row is not deleted
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');

// Avoid loading the real queue/metrics stack.
jest.mock('../queue', () => ({
  addAIJob: jest.fn(),
  checkRedisAvailable: jest.fn().mockResolvedValue(true),
}));

// Auth is mocked so we can simulate multiple users deterministically.
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, _res, next) => {
    const userId = req.headers['x-test-user-id'] || '11111111-1111-4111-8111-111111111111';
    req.user = { id: String(userId), email: 'test@example.com', username: 'test', role: 'user' };
    next();
  },
}));

// We mock the photos DB service to keep a simple in-memory photo store.
// Jest requires out-of-scope references in jest.mock factories to be prefixed with `mock`.
var mockPhotoStore = new Map();
var mockLastPhotosDb = null;

jest.mock('../services/photosDb', () => {
  return function createPhotosDb() {
    mockLastPhotosDb = {
      resolvePhotoPrimaryId: jest.fn(async (id, userId) => {
        const key = String(id);
        const row = mockPhotoStore.get(key);
        if (!row) return null;
        if (row.user_id !== String(userId)) return null;
        return key;
      }),
      getPhotoById: jest.fn(async (id, userId) => {
        const key = String(id);
        const row = mockPhotoStore.get(key);
        if (!row) return null;
        if (row.user_id !== String(userId)) return null;
        return row;
      }),
      deletePhoto: jest.fn(async (id, userId) => {
        const key = String(id);
        const row = mockPhotoStore.get(key);
        if (!row) return false;
        if (row.user_id !== String(userId)) return false;
        mockPhotoStore.delete(key);
        return true;
      }),
    };

    return mockLastPhotosDb;
  };
});

const createPhotosRouter = require('../routes/photos');

function buildApp({ storageState, failingPaths }) {
  const removeMock = jest.fn(async (paths) => {
    const [first] = Array.isArray(paths) ? paths : [];
    const path = typeof first === 'string' ? first : '';

    if (failingPaths && failingPaths.has(path)) {
      return { data: null, error: new Error('Simulated storage remove failure') };
    }

    if (path) storageState.delete(path);
    return { data: { removed: [path].filter(Boolean) }, error: null };
  });

  const supabase = {
    storage: {
      from: jest.fn(() => ({
        remove: removeMock,
        // These exist on the real client and some routes may reference them.
        upload: jest.fn(async () => ({ data: null, error: null })),
        download: jest.fn(async () => ({ data: null, error: null })),
        move: jest.fn(async () => ({ data: null, error: null })),
        getPublicUrl: jest.fn(() => ({ data: { publicUrl: 'http://example.com/x' } })),
        createSignedUrl: jest.fn(async () => ({ data: { signedUrl: 'http://example.com/s' }, error: null })),
      })),
    },
  };

  // DB is not exercised by the delete route in these tests (photosDb is mocked),
  // but other routes are registered on this router so provide a minimal stub.
  const db = jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    then: jest.fn((resolve) => resolve([])),
  }));

  const app = express();
  app.use(express.json());
  app.use('/photos', createPhotosRouter({ db, supabase }));

  return { app, removeMock };
}

describe('DELETE /photos/:id (secure deletion)', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    mockPhotoStore = new Map();
    mockLastPhotosDb = null;
  });

  test('happy path: deletes storage then deletes DB row', async () => {
    const storageState = new Set([
      'finished/p1.jpg',
      'display/p1.jpg',
      'original/p1.jpg',
      'thumbnails/h1.jpg',
      'thumbnails/h1-sm.jpg',
      'inprogress/edited-p1.jpg',
    ]);

    mockPhotoStore.set('1', {
      id: '1',
      user_id: userA,
      filename: 'p1.jpg',
      state: 'finished',
      storage_path: 'finished/p1.jpg',
      display_path: 'display/p1.jpg',
      original_path: 'original/p1.jpg',
      hash: 'h1',
      thumb_path: 'thumbnails/h1.jpg',
      thumb_small_path: 'thumbnails/h1-sm.jpg',
      edited_filename: 'edited-p1.jpg',
    });

    const { app, removeMock } = buildApp({ storageState });

    const res = await request(app)
      .delete('/photos/1')
      .set('x-test-user-id', userA)
      .expect(200);

    expect(res.body).toEqual({ success: true, message: 'Photo deleted successfully' });

    // DB row removed
    expect(mockPhotoStore.has('1')).toBe(false);

    // Storage remove called and objects removed
    expect(removeMock).toHaveBeenCalled();
    expect(removeMock).toHaveBeenCalledWith(['finished/p1.jpg']);
    expect(removeMock).toHaveBeenCalledWith(['display/p1.jpg']);
    expect(storageState.has('finished/p1.jpg')).toBe(false);
    expect(storageState.has('display/p1.jpg')).toBe(false);
    expect(storageState.has('original/p1.jpg')).toBe(false);

    // DB delete executed after storage success
    expect(mockLastPhotosDb).toBeTruthy();
    expect(mockLastPhotosDb.deletePhoto).toHaveBeenCalledWith('1', userA);
  });

  test('ownership: non-owner cannot delete another user\'s photo', async () => {
    const storageState = new Set(['finished/p2.jpg']);

    mockPhotoStore.set('2', {
      id: '2',
      user_id: userA,
      filename: 'p2.jpg',
      state: 'finished',
      storage_path: 'finished/p2.jpg',
    });

    const { app, removeMock } = buildApp({ storageState });

    const res = await request(app)
      .delete('/photos/2')
      .set('x-test-user-id', userB)
      .expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Photo not found');

    // DB row remains
    expect(mockPhotoStore.has('2')).toBe(true);

    // No storage deletion attempted
    expect(removeMock).not.toHaveBeenCalled();
    expect(storageState.has('finished/p2.jpg')).toBe(true);
  });

  test('abort safety: if storage deletion fails, returns 500 and DB row remains', async () => {
    const storageState = new Set([
      'thumbnails/fail-sm.jpg',
      'finished/p3.jpg',
    ]);

    mockPhotoStore.set('3', {
      id: '3',
      user_id: userA,
      filename: 'p3.jpg',
      state: 'finished',
      storage_path: 'finished/p3.jpg',
      // Ensure the first attempted delete is a deterministic failing path
      thumb_small_path: 'thumbnails/fail-sm.jpg',
    });

    const failingPaths = new Set(['thumbnails/fail-sm.jpg']);

    const { app, removeMock } = buildApp({ storageState, failingPaths });

    const res = await request(app)
      .delete('/photos/3')
      .set('x-test-user-id', userA)
      .expect(500);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to delete photo from storage. Please retry.');

    // DB row remains
    expect(mockPhotoStore.has('3')).toBe(true);

    // Only the failing delete attempt should have been made; DB delete not called.
    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(['thumbnails/fail-sm.jpg']);
    expect(mockLastPhotosDb.deletePhoto).not.toHaveBeenCalled();

    // Storage objects remain
    expect(storageState.has('thumbnails/fail-sm.jpg')).toBe(true);
    expect(storageState.has('finished/p3.jpg')).toBe(true);
  });
});
