// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../utils/clientImageProcessing', () => ({
  generateClientThumbnail: vi.fn(),
}));

vi.mock('../utils/thumbnailCache', () => ({
  getThumbnail: vi.fn(),
  saveThumbnail: vi.fn(),
}));

import { generateClientThumbnail } from '../utils/clientImageProcessing';
import { getThumbnail, saveThumbnail } from '../utils/thumbnailCache';
import { useThumbnailQueue } from './useThumbnailQueue';

function createMockFile(name: string) {
  return {
    name,
    type: 'image/jpeg',
    size: 1024,
    lastModified: Date.now(),
    slice: () => new Blob(['test'], { type: 'image/jpeg' }),
  };
}

async function flushQueue(batchInterval = 20) {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  await act(async () => {
    vi.advanceTimersByTime(batchInterval + 20);
  });

  await act(async () => {
    await Promise.resolve();
  });
}

describe('useThumbnailQueue Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    getThumbnail.mockResolvedValue(null);
    saveThumbnail.mockResolvedValue(undefined);
    generateClientThumbnail.mockResolvedValue(new Blob(['thumb'], { type: 'image/jpeg' }));

    global.URL.createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}:${Math.random()}`);
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
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
    const files = [createMockFile('test1.jpg'), createMockFile('test2.jpg')];

    const { result } = renderHook(() => useThumbnailQueue(files, { batchInterval: 20, concurrency: 2 }));

    expect(result.current.progress.total).toBe(2);

    await flushQueue(20);

    expect(result.current.progress.completed).toBe(2);
    expect(result.current.thumbnails.size).toBe(2);
    expect(result.current.isComplete).toBe(true);
  });

  it('should handle failures gracefully', async () => {
    generateClientThumbnail.mockRejectedValue(new Error('Failed'));

    const files = [createMockFile('fail.jpg')];
    const { result } = renderHook(() => useThumbnailQueue(files, { batchInterval: 20 }));

    await flushQueue(20);

    expect(result.current.progress.completed).toBe(1);
    expect(result.current.progress.failed).toBe(1);
    expect(result.current.thumbnails.size).toBe(0);
  });

  it('should revoke URLs on unmount', async () => {
    const revokedUrls: string[] = [];
    global.URL.revokeObjectURL = vi.fn((url: string) => revokedUrls.push(url));

    const files = [createMockFile('cleanup.jpg')];
    const { result, unmount } = renderHook(() => useThumbnailQueue(files, { batchInterval: 20 }));

    await flushQueue(20);
    expect(result.current.progress.completed).toBe(1);

    unmount();

    expect(revokedUrls.length).toBeGreaterThan(0);
  });
});
