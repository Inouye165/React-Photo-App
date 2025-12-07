/**
 * useThumbnailQueue Hook Tests
 * 
 * Comprehensive test suite covering:
 * 1. Completion: Processing N files results in N completed thumbnails
 * 2. Error Handling: Failed thumbnails increment failed count, queue continues
 * 3. Cleanup: Unmounting revokes all created Blob URLs (memory safety)
 * 4. Edge Cases: Empty files, concurrent processing
 * 
 * IMPORTANT: We mock heavy dependencies (heic2any, heic-to) at the module level
 * to prevent memory issues during testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// CRITICAL: Mock heavy dependencies that import WASM/heavy code
// These mocks are hoisted by vitest to run before imports
vi.mock('heic2any', () => ({ default: vi.fn() }));
vi.mock('heic-to', () => ({ heicTo: vi.fn() }));
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  createStore: vi.fn(() => ({})),
}));

// Mock the actual utility modules used by the hook
vi.mock('../utils/clientImageProcessing.js', () => ({
  generateClientThumbnail: vi.fn(),
}));

vi.mock('../utils/thumbnailCache.js', () => ({
  getThumbnail: vi.fn(),
  saveThumbnail: vi.fn(),
}));

// Now import the mocked modules - these use the mocked versions
import { generateClientThumbnail } from '../utils/clientImageProcessing.js';
import { getThumbnail, saveThumbnail } from '../utils/thumbnailCache.js';

// Import hook AFTER mocks are set up
import { useThumbnailQueue } from './useThumbnailQueue.js';

describe('useThumbnailQueue Hook', () => {
  // Track all created and revoked URLs for memory leak testing
  let createdUrls = [];
  let revokedUrls = [];
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  /**
   * Create a mock File object for testing
   */
  function createMockFile(name, type = 'image/jpeg', size = 1024) {
    return {
      name,
      type,
      size,
      lastModified: Date.now(),
    };
  }

  /**
   * Create a mock Blob for thumbnail generation
   */
  function createMockBlob() {
    return new Blob(['test'], { type: 'image/jpeg' });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset URL tracking
    createdUrls = [];
    revokedUrls = [];

    // Mock URL.createObjectURL to track created URLs
    URL.createObjectURL = vi.fn((_blob) => {
      const url = `blob:http://localhost/${Math.random().toString(36).slice(2)}`;
      createdUrls.push(url);
      return url;
    });

    // Mock URL.revokeObjectURL to track revoked URLs
    URL.revokeObjectURL = vi.fn((url) => {
      revokedUrls.push(url);
    });

    // Default mock implementations - resolve immediately
    getThumbnail.mockResolvedValue(null); // No cache by default
    saveThumbnail.mockResolvedValue(undefined);
    generateClientThumbnail.mockResolvedValue(createMockBlob());
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  describe('Initialization & Empty State', () => {
    it('should handle empty file list gracefully', () => {
      const { result } = renderHook(() => useThumbnailQueue([]));

      expect(result.current.thumbnails.size).toBe(0);
      expect(result.current.status.size).toBe(0);
      expect(result.current.progress).toEqual({ completed: 0, total: 0, failed: 0 });
      expect(result.current.isComplete).toBe(false);
    });

    it('should handle null files gracefully', () => {
      const { result } = renderHook(() => useThumbnailQueue(null));

      expect(result.current.thumbnails.size).toBe(0);
      expect(result.current.progress.total).toBe(0);
    });

    it('should handle undefined files gracefully', () => {
      const { result } = renderHook(() => useThumbnailQueue(undefined));

      expect(result.current.thumbnails.size).toBe(0);
      expect(result.current.progress.total).toBe(0);
    });
  });

  describe('Completion: Processing Files Successfully', () => {
    it('should process 10 files and complete all 10 thumbnails', async () => {
      // Create 10 mock files
      const files = Array.from({ length: 10 }, (_, i) => 
        createMockFile(`image${i + 1}.jpg`)
      );

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      // Initial state should show pending files
      expect(result.current.progress.total).toBe(10);

      // Wait for completion with real timers
      await waitFor(() => {
        expect(result.current.progress.completed).toBe(10);
      }, { timeout: 5000 });

      expect(result.current.thumbnails.size).toBe(10);
      expect(result.current.progress.failed).toBe(0);
      expect(result.current.isComplete).toBe(true);

      // Verify all 10 files have success status
      files.forEach(file => {
        expect(result.current.status.get(file.name)).toBe('success');
      });
    });

    it('should process files with custom concurrency', async () => {
      const files = Array.from({ length: 4 }, (_, i) => 
        createMockFile(`image${i + 1}.jpg`)
      );

      // Use concurrency of 2
      const { result } = renderHook(() => 
        useThumbnailQueue(files, { concurrency: 2, batchInterval: 20 })
      );

      await waitFor(() => {
        expect(result.current.progress.completed).toBe(4);
      }, { timeout: 5000 });

      expect(result.current.thumbnails.size).toBe(4);
    });

    it('should use cached thumbnails when available', async () => {
      const cachedBlob = createMockBlob();
      getThumbnail.mockResolvedValue(cachedBlob);

      const files = [createMockFile('cached.jpg')];

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      await waitFor(() => {
        expect(result.current.progress.completed).toBe(1);
      });

      // Should have used cache, not generated new thumbnail
      expect(getThumbnail).toHaveBeenCalled();
      expect(generateClientThumbnail).not.toHaveBeenCalled();
      expect(result.current.thumbnails.size).toBe(1);
    });
  });

  describe('Error Handling: Failed Thumbnails', () => {
    it('should continue processing when a thumbnail fails', async () => {
      const files = Array.from({ length: 5 }, (_, i) => 
        createMockFile(`image${i + 1}.jpg`)
      );

      // Make the 3rd file fail
      generateClientThumbnail.mockImplementation((file) => {
        if (file.name === 'image3.jpg') {
          return Promise.reject(new Error('Processing failed'));
        }
        return Promise.resolve(createMockBlob());
      });

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      await waitFor(() => {
        expect(result.current.progress.completed).toBe(5);
      }, { timeout: 5000 });

      // Should have 4 successful + 1 failed
      expect(result.current.thumbnails.size).toBe(4);
      expect(result.current.progress.failed).toBe(1);
      expect(result.current.status.get('image3.jpg')).toBe('failed');
      expect(result.current.isComplete).toBe(true);
    });

    it('should increment failed count when thumbnail generation returns null', async () => {
      const files = [createMockFile('nullresult.jpg')];

      generateClientThumbnail.mockResolvedValue(null);

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      await waitFor(() => {
        expect(result.current.progress.completed).toBe(1);
      });

      expect(result.current.progress.failed).toBe(1);
      expect(result.current.status.get('nullresult.jpg')).toBe('failed');
    });

    it('should handle multiple failures gracefully', async () => {
      const files = Array.from({ length: 5 }, (_, i) => 
        createMockFile(`image${i + 1}.jpg`)
      );

      // Make all files fail
      generateClientThumbnail.mockRejectedValue(new Error('All failed'));

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      await waitFor(() => {
        expect(result.current.progress.completed).toBe(5);
      }, { timeout: 5000 });

      expect(result.current.progress.failed).toBe(5);
      expect(result.current.thumbnails.size).toBe(0);
      expect(result.current.isComplete).toBe(true);
    });
  });

  describe('Memory Safety: Blob URL Cleanup', () => {
    it('should revoke all Blob URLs on unmount', async () => {
      const files = Array.from({ length: 3 }, (_, i) => 
        createMockFile(`image${i + 1}.jpg`)
      );

      const { result, unmount } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      // Wait for processing to complete
      await waitFor(() => {
        expect(result.current.progress.completed).toBe(3);
      });

      // Record how many URLs were created
      const urlsCreatedCount = createdUrls.length;
      expect(urlsCreatedCount).toBe(3);

      // Unmount the component
      unmount();

      // All created URLs should be revoked
      expect(revokedUrls.length).toBe(urlsCreatedCount);
      createdUrls.forEach(url => {
        expect(revokedUrls).toContain(url);
      });
    });

    it('should revoke URLs in pending buffer on unmount', async () => {
      const files = Array.from({ length: 3 }, (_, i) => 
        createMockFile(`image${i + 1}.jpg`)
      );

      // Make processing resolve after a delay
      generateClientThumbnail.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(createMockBlob()), 10))
      );

      const { unmount } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 1000 }) // Long batch interval
      );

      // Wait a bit for URLs to be created but not flushed
      await new Promise(resolve => setTimeout(resolve, 50));

      const urlsBeforeUnmount = createdUrls.length;
      
      // Unmount before flush occurs
      unmount();

      // All URLs should be revoked even if not flushed to state
      expect(revokedUrls.length).toBe(urlsBeforeUnmount);
    });
  });

  describe('Concurrency Control', () => {
    it('should respect concurrency limit', async () => {
      let activeProcessing = 0;
      let maxConcurrent = 0;

      const files = Array.from({ length: 8 }, (_, i) => 
        createMockFile(`image${i + 1}.jpg`)
      );

      generateClientThumbnail.mockImplementation(() => {
        activeProcessing++;
        maxConcurrent = Math.max(maxConcurrent, activeProcessing);
        
        return new Promise(resolve => {
          setTimeout(() => {
            activeProcessing--;
            resolve(createMockBlob());
          }, 10);
        });
      });

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { concurrency: 4, batchInterval: 20 })
      );

      await waitFor(() => {
        expect(result.current.progress.completed).toBe(8);
      }, { timeout: 5000 });

      // Should never exceed concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(4);
    });

    it('should use default concurrency of 4', async () => {
      let maxConcurrent = 0;
      let activeProcessing = 0;

      const files = Array.from({ length: 8 }, (_, i) => 
        createMockFile(`image${i + 1}.jpg`)
      );

      generateClientThumbnail.mockImplementation(() => {
        activeProcessing++;
        maxConcurrent = Math.max(maxConcurrent, activeProcessing);
        
        return new Promise(resolve => {
          setTimeout(() => {
            activeProcessing--;
            resolve(createMockBlob());
          }, 15);
        });
      });

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      await waitFor(() => {
        expect(result.current.progress.completed).toBe(8);
      }, { timeout: 5000 });

      // Default concurrency is 4
      expect(maxConcurrent).toBeLessThanOrEqual(4);
    });
  });

  describe('Edge Cases', () => {
    it('should not reprocess already processed files', async () => {
      const file1 = createMockFile('image1.jpg');
      
      const { result, rerender } = renderHook(
        ({ files }) => useThumbnailQueue(files, { batchInterval: 20 }),
        { initialProps: { files: [file1] } }
      );

      // Process first file
      await waitFor(() => {
        expect(result.current.thumbnails.size).toBe(1);
      });

      const callCountAfterFirst = generateClientThumbnail.mock.calls.length;

      // Re-render with same file
      rerender({ files: [file1] });

      // Wait a bit to ensure no extra processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have processed again
      expect(generateClientThumbnail.mock.calls.length).toBe(callCountAfterFirst);
    });

    it('should handle file list changes', async () => {
      const file1 = createMockFile('image1.jpg');
      const file2 = createMockFile('image2.jpg');

      const { result, rerender } = renderHook(
        ({ files }) => useThumbnailQueue(files, { batchInterval: 20 }),
        { initialProps: { files: [file1] } }
      );

      // Process first file
      await waitFor(() => {
        expect(result.current.thumbnails.size).toBe(1);
      });

      // Add second file
      rerender({ files: [file1, file2] });

      await waitFor(() => {
        expect(result.current.thumbnails.size).toBe(2);
      });
    });

    it('should reset state when files become empty', async () => {
      const files = [createMockFile('test.jpg')];

      const { result, rerender } = renderHook(
        ({ files }) => useThumbnailQueue(files, { batchInterval: 20 }),
        { initialProps: { files } }
      );

      await waitFor(() => {
        expect(result.current.thumbnails.size).toBe(1);
      });

      // Set files to empty
      rerender({ files: [] });

      expect(result.current.thumbnails.size).toBe(0);
      expect(result.current.progress.total).toBe(0);
    });
  });

  describe('Cache Integration', () => {
    it('should save generated thumbnails to cache', async () => {
      const files = [createMockFile('newfile.jpg')];
      
      getThumbnail.mockResolvedValue(null); // No cache
      saveThumbnail.mockResolvedValue(undefined);

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      await waitFor(() => {
        expect(result.current.progress.completed).toBe(1);
      });

      expect(saveThumbnail).toHaveBeenCalled();
    });

    it('should handle cache save failure gracefully', async () => {
      const files = [createMockFile('cachefail.jpg')];
      
      getThumbnail.mockResolvedValue(null);
      saveThumbnail.mockRejectedValue(new Error('Cache write failed'));

      const { result } = renderHook(() => 
        useThumbnailQueue(files, { batchInterval: 20 })
      );

      // Should still succeed even if cache fails
      await waitFor(() => {
        expect(result.current.thumbnails.size).toBe(1);
      });
    });
  });
});
