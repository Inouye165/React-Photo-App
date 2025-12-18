/**
 * Tests for Thumbnail Cache Utility
 * 
 * Tests IndexedDB caching functionality with mocked idb-keyval.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateCacheKey,
  getThumbnail,
  saveThumbnail,
  removeThumbnail,
  hasThumbnail,
} from './thumbnailCache';

// Mock idb-keyval module
vi.mock('idb-keyval', () => {
  const mockStore = {};
  return {
    get: vi.fn((key) => Promise.resolve(mockStore[key] || undefined)),
    set: vi.fn((key, value) => {
      mockStore[key] = value;
      return Promise.resolve();
    }),
    del: vi.fn((key) => {
      delete mockStore[key];
      return Promise.resolve();
    }),
    createStore: vi.fn(() => ({})),
    // Expose mockStore for test manipulation
    __mockStore: mockStore,
    __resetMockStore: () => {
      for (const key in mockStore) {
        delete mockStore[key];
      }
    },
  };
});

// Helper to create a mock File
function createMockFile(name = 'test.jpg', size = 1024, lastModified = 1234567890) {
  const file = new File([''], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: size });
  Object.defineProperty(file, 'lastModified', { value: lastModified });
  return file;
}

// Helper to create a mock Blob (simulating thumbnail)
function createMockBlob() {
  return new Blob(['thumbnail-data'], { type: 'image/jpeg' });
}

describe('thumbnailCache', () => {
  let idbKeyval;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Get the mocked module
    idbKeyval = await import('idb-keyval');
    idbKeyval.__resetMockStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateCacheKey', () => {
    it('should generate a key from file name, lastModified, and size', () => {
      const file = createMockFile('photo.jpg', 2048, 9876543210);
      const key = generateCacheKey(file);

      expect(key).toBe('photo.jpg-9876543210-2048');
    });

    it('should generate different keys for files with different names', () => {
      const file1 = createMockFile('photo1.jpg', 1024, 1234567890);
      const file2 = createMockFile('photo2.jpg', 1024, 1234567890);

      expect(generateCacheKey(file1)).not.toBe(generateCacheKey(file2));
    });

    it('should generate different keys for files with different sizes', () => {
      const file1 = createMockFile('photo.jpg', 1024, 1234567890);
      const file2 = createMockFile('photo.jpg', 2048, 1234567890);

      expect(generateCacheKey(file1)).not.toBe(generateCacheKey(file2));
    });

    it('should generate different keys for files with different lastModified', () => {
      const file1 = createMockFile('photo.jpg', 1024, 1234567890);
      const file2 = createMockFile('photo.jpg', 1024, 9876543210);

      expect(generateCacheKey(file1)).not.toBe(generateCacheKey(file2));
    });

    it('should throw error for invalid file (null)', () => {
      expect(() => generateCacheKey(null)).toThrow('Invalid file');
    });

    it('should throw error for file without name', () => {
      expect(() => generateCacheKey({})).toThrow('Invalid file');
    });
  });

  describe('getThumbnail', () => {
    it('should return null when cache is empty', async () => {
      const file = createMockFile();
      const result = await getThumbnail(file);

      expect(result).toBeNull();
    });

    it('should return cached blob when present', async () => {
      const file = createMockFile();
      const blob = createMockBlob();
      const key = generateCacheKey(file);
      
      // Manually populate the mock store
      idbKeyval.__mockStore[key] = blob;

      const result = await getThumbnail(file);

      expect(result).toBeInstanceOf(Blob);
    });

    it('should return null for non-Blob cached data', async () => {
      const file = createMockFile();
      const key = generateCacheKey(file);
      
      // Put invalid data in cache
      idbKeyval.__mockStore[key] = 'not-a-blob';

      const result = await getThumbnail(file);

      expect(result).toBeNull();
    });

    it('should handle IndexedDB errors gracefully', async () => {
      const file = createMockFile();
      
      // Make get throw an error
      idbKeyval.get.mockRejectedValueOnce(new Error('IDB Error'));

      const result = await getThumbnail(file);

      expect(result).toBeNull();
    });
  });

  describe('saveThumbnail', () => {
    it('should save thumbnail blob and return true', async () => {
      const file = createMockFile();
      const blob = createMockBlob();

      const result = await saveThumbnail(file, blob);

      expect(result).toBe(true);
      expect(idbKeyval.set).toHaveBeenCalledWith(
        generateCacheKey(file),
        blob,
        expect.anything()
      );
    });

    it('should return false for null thumbnail', async () => {
      const file = createMockFile();

      const result = await saveThumbnail(file, null);

      expect(result).toBe(false);
      expect(idbKeyval.set).not.toHaveBeenCalled();
    });

    it('should return false for non-Blob thumbnail', async () => {
      const file = createMockFile();

      const result = await saveThumbnail(file, 'not-a-blob');

      expect(result).toBe(false);
      expect(idbKeyval.set).not.toHaveBeenCalled();
    });

    it('should handle IndexedDB errors gracefully (quota exceeded)', async () => {
      const file = createMockFile();
      const blob = createMockBlob();
      
      // Simulate quota exceeded error
      idbKeyval.set.mockRejectedValueOnce(new Error('QuotaExceededError'));

      const result = await saveThumbnail(file, blob);

      expect(result).toBe(false);
    });
  });

  describe('removeThumbnail', () => {
    it('should remove cached thumbnail and return true', async () => {
      const file = createMockFile();

      const result = await removeThumbnail(file);

      expect(result).toBe(true);
      expect(idbKeyval.del).toHaveBeenCalledWith(
        generateCacheKey(file),
        expect.anything()
      );
    });

    it('should handle IndexedDB errors gracefully', async () => {
      const file = createMockFile();
      
      idbKeyval.del.mockRejectedValueOnce(new Error('IDB Error'));

      const result = await removeThumbnail(file);

      expect(result).toBe(false);
    });
  });

  describe('hasThumbnail', () => {
    it('should return true when cached blob exists', async () => {
      const file = createMockFile();
      const blob = createMockBlob();
      const key = generateCacheKey(file);
      
      idbKeyval.__mockStore[key] = blob;

      const result = await hasThumbnail(file);

      expect(result).toBe(true);
    });

    it('should return false when cache is empty', async () => {
      const file = createMockFile();

      const result = await hasThumbnail(file);

      expect(result).toBe(false);
    });

    it('should return false for non-Blob cached data', async () => {
      const file = createMockFile();
      const key = generateCacheKey(file);
      
      idbKeyval.__mockStore[key] = { invalid: 'data' };

      const result = await hasThumbnail(file);

      expect(result).toBe(false);
    });

    it('should return false on IndexedDB error', async () => {
      const file = createMockFile();
      
      idbKeyval.get.mockRejectedValueOnce(new Error('IDB Error'));

      const result = await hasThumbnail(file);

      expect(result).toBe(false);
    });
  });

  describe('integration: save then get', () => {
    it('should retrieve a previously saved thumbnail', async () => {
      const file = createMockFile('integration-test.jpg', 5000, 1700000000000);
      const blob = createMockBlob();

      // Save first
      const saveResult = await saveThumbnail(file, blob);
      expect(saveResult).toBe(true);

      // Now retrieve
      const key = generateCacheKey(file);
      idbKeyval.__mockStore[key] = blob; // Simulate the save

      const retrieved = await getThumbnail(file);
      expect(retrieved).toBeInstanceOf(Blob);
    });
  });
});
