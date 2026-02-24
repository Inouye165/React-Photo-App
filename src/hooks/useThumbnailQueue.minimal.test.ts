// @ts-nocheck
/**
 * useThumbnailQueue Hook Tests
 * 
 * Uses dynamic imports with vi.doMock to prevent heavy WASM deps from loading
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

let useThumbnailQueue;
let generateClientThumbnail;
let getThumbnail;
let saveThumbnail;

vi.mock('heic2any', () => ({ default: vi.fn() }));
vi.mock('heic-to', () => ({ heicTo: vi.fn() }));
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  createStore: vi.fn(() => ({})),
}));
vi.mock('../utils/clientImageProcessing', () => ({
  generateClientThumbnail: vi.fn(),
}));
vi.mock('../utils/thumbnailCache', () => ({
  getThumbnail: vi.fn(),
  saveThumbnail: vi.fn(),
}));

describe('useThumbnailQueue Hook', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();

    const hookModule = await import('./useThumbnailQueue');
    const imageProcessing = await import('../utils/clientImageProcessing');
    const thumbnailCache = await import('../utils/thumbnailCache');

    useThumbnailQueue = hookModule.useThumbnailQueue;
    generateClientThumbnail = imageProcessing.generateClientThumbnail;
    getThumbnail = thumbnailCache.getThumbnail;
    saveThumbnail = thumbnailCache.saveThumbnail;
    
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
  }, 15000);

  it('should handle null input', () => {
    const { result } = renderHook(() => useThumbnailQueue(null));
    expect(result.current.thumbnails.size).toBe(0);
  }, 15000);

  it('should process files and complete', async () => {
    const files = [
      { name: 'test1.jpg', type: 'image/jpeg', size: 1024, lastModified: Date.now() },
      { name: 'test2.jpg', type: 'image/jpeg', size: 1024, lastModified: Date.now() },
    ];

    const { result } = renderHook(() => useThumbnailQueue(files, { batchInterval: 1 }));

    expect(result.current.progress.total).toBe(2);

    await waitFor(() => {
      expect(result.current.progress.completed).toBe(2);
    }, { timeout: 10000 });

    expect(result.current.thumbnails.size).toBe(2);
    expect(result.current.isComplete).toBe(true);
  }, 15000);

  it('should handle failures gracefully', async () => {
    generateClientThumbnail.mockRejectedValue(new Error('Failed'));

    const files = [{ name: 'fail.jpg', type: 'image/jpeg', size: 1024, lastModified: Date.now() }];

    const { result } = renderHook(() => useThumbnailQueue(files, { batchInterval: 1 }));

    await waitFor(() => {
      expect(result.current.progress.completed).toBe(1);
    }, { timeout: 10000 });

    expect(result.current.progress.failed).toBe(1);
    expect(result.current.thumbnails.size).toBe(0);
  }, 15000);

  it('should revoke URLs on unmount', async () => {
    const revokedUrls = [];
    URL.revokeObjectURL = vi.fn((url) => revokedUrls.push(url));

    const files = [{ name: 'cleanup.jpg', type: 'image/jpeg', size: 1024, lastModified: Date.now() }];

    const { result, unmount } = renderHook(() => useThumbnailQueue(files, { batchInterval: 1 }));

    await waitFor(() => {
      expect(result.current.progress.completed).toBe(1);
    }, { timeout: 10000 });

    unmount();

    expect(revokedUrls.length).toBeGreaterThan(0);
  }, 15000);
});
