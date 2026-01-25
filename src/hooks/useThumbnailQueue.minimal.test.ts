// @ts-nocheck
/**
 * useThumbnailQueue Hook Tests
 * 
 * Uses dynamic imports with vi.doMock to prevent heavy WASM deps from loading
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Store module references after dynamic import
let useThumbnailQueue;
let generateClientThumbnail;
let getThumbnail;
let saveThumbnail;

beforeAll(async () => {
  // Set up mocks BEFORE dynamic imports
  vi.doMock('heic2any', () => ({ default: vi.fn() }));
  vi.doMock('heic-to', () => ({ heicTo: vi.fn() }));
  vi.doMock('idb-keyval', () => ({
    get: vi.fn(),
    set: vi.fn(), 
    del: vi.fn(),
    createStore: vi.fn(() => ({})),
  }));

  vi.doMock('../utils/clientImageProcessing', () => ({
    generateClientThumbnail: vi.fn(),
  }));

  vi.doMock('../utils/thumbnailCache', () => ({
    getThumbnail: vi.fn(),
    saveThumbnail: vi.fn(),
  }));

  // Now dynamically import with mocks active
  const imageProcessing = await import('../utils/clientImageProcessing');
  const thumbnailCache = await import('../utils/thumbnailCache');
  const hookModule = await import('./useThumbnailQueue');

  generateClientThumbnail = imageProcessing.generateClientThumbnail;
  getThumbnail = thumbnailCache.getThumbnail;
  saveThumbnail = thumbnailCache.saveThumbnail;
  useThumbnailQueue = hookModule.useThumbnailQueue;
});

describe('useThumbnailQueue Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock implementations
    getThumbnail.mockResolvedValue(null);
    saveThumbnail.mockResolvedValue(undefined);
    generateClientThumbnail.mockResolvedValue(new Blob(['test'], { type: 'image/jpeg' }));
    
    // Mock URL functions
    URL.createObjectURL = vi.fn(() => `blob:http://localhost/${Math.random()}`);
    URL.revokeObjectURL = vi.fn();
  });

  it('should handle empty array', () => {
    const { result } = renderHook(() => useThumbnailQueue([]));
    expect(result.current.thumbnails.size).toBe(0);
    expect(result.current.progress).toEqual({ completed: 0, total: 0, failed: 0 });
  });

  it('should handle null input', () => {
    const { result } = renderHook(() => useThumbnailQueue(null));
    expect(result.current.thumbnails.size).toBe(0);
  });

  it('should process files and complete', async () => {
    const files = [
      { name: 'test1.jpg', type: 'image/jpeg', size: 1024, lastModified: Date.now() },
      { name: 'test2.jpg', type: 'image/jpeg', size: 1024, lastModified: Date.now() },
    ];

    const { result } = renderHook(() => useThumbnailQueue(files, { batchInterval: 20 }));

    expect(result.current.progress.total).toBe(2);

    await waitFor(() => {
      expect(result.current.progress.completed).toBe(2);
    }, { timeout: 3000 });

    expect(result.current.thumbnails.size).toBe(2);
    expect(result.current.isComplete).toBe(true);
  });

  it('should handle failures gracefully', async () => {
    generateClientThumbnail.mockRejectedValue(new Error('Failed'));

    const files = [{ name: 'fail.jpg', type: 'image/jpeg', size: 1024, lastModified: Date.now() }];

    const { result } = renderHook(() => useThumbnailQueue(files, { batchInterval: 20 }));

    await waitFor(() => {
      expect(result.current.progress.completed).toBe(1);
    }, { timeout: 3000 });

    expect(result.current.progress.failed).toBe(1);
    expect(result.current.thumbnails.size).toBe(0);
  });

  it('should revoke URLs on unmount', async () => {
    const revokedUrls = [];
    URL.revokeObjectURL = vi.fn((url) => revokedUrls.push(url));

    const files = [{ name: 'cleanup.jpg', type: 'image/jpeg', size: 1024, lastModified: Date.now() }];

    const { result, unmount } = renderHook(() => useThumbnailQueue(files, { batchInterval: 20 }));

    await waitFor(() => {
      expect(result.current.progress.completed).toBe(1);
    }, { timeout: 3000 });

    unmount();

    expect(revokedUrls.length).toBeGreaterThan(0);
  });
});
