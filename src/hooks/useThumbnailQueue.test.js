/**
 * useThumbnailQueue Hook Unit Tests
 * 
 * Best Practice Implementation:
 * 1. Mocks the immediate dependency (clientImageProcessing) to bypass WASM entirely.
 * 2. Uses Fake Timers to deterministically test the batching interval.
 * 3. Uses `act` to handle state updates and promise resolutions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the utility modules completely
vi.mock('../utils/clientImageProcessing', () => ({
  generateClientThumbnail: vi.fn(),
}));

vi.mock('../utils/thumbnailCache', () => ({
  getThumbnail: vi.fn(),
  saveThumbnail: vi.fn(),
}));

// Import the mocked modules
import { generateClientThumbnail } from '../utils/clientImageProcessing';
import { getThumbnail, saveThumbnail } from '../utils/thumbnailCache';
import { useThumbnailQueue } from './useThumbnailQueue';

describe('useThumbnailQueue Hook', () => {
  
  function createMockFile(name) {
    return {
      name,
      type: 'image/jpeg',
      size: 1024,
      lastModified: Date.now(),
      slice: () => new Blob(['test'], { type: 'image/jpeg' }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default mock implementations
    getThumbnail.mockResolvedValue(null);
    saveThumbnail.mockResolvedValue(undefined);
    generateClientThumbnail.mockResolvedValue(
      new Blob(['thumbnail-data'], { type: 'image/jpeg' })
    );

    // Mock URL APIs
    global.URL.createObjectURL = vi.fn(blob => `blob:${blob.size}`);
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should process a single file successfully', async () => {
    const file = createMockFile('test.jpg');
    const BATCH_INTERVAL = 100;

    const { result } = renderHook(() => 
      useThumbnailQueue([file], { batchInterval: BATCH_INTERVAL })
    );

    // Initial state
    expect(result.current.thumbnails.size).toBe(0);
    expect(result.current.progress.total).toBe(1);

    // 1. Allow async processing to complete (flush microtasks)
    await act(async () => {
      await Promise.resolve(); 
      await Promise.resolve(); // Extra tick for safety
    });

    // 2. Advance timer to trigger the batch flush
    await act(async () => {
      vi.advanceTimersByTime(BATCH_INTERVAL + 10);
    });

    // Assertions
    expect(result.current.thumbnails.size).toBe(1);
    expect(result.current.thumbnails.get('test.jpg')).toBeDefined();
    expect(result.current.progress.completed).toBe(1);
    expect(generateClientThumbnail).toHaveBeenCalledWith(file);
  });

  it('should handle multiple files concurrently', async () => {
    const files = [
      createMockFile('1.jpg'),
      createMockFile('2.jpg'),
      createMockFile('3.jpg')
    ];
    const BATCH_INTERVAL = 100;

    const { result } = renderHook(() => 
      useThumbnailQueue(files, { batchInterval: BATCH_INTERVAL, concurrency: 2 })
    );

    expect(result.current.progress.total).toBe(3);

    // Flush microtasks and timers
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(BATCH_INTERVAL + 10);
    });

    // Should be done
    expect(result.current.thumbnails.size).toBe(3);
    expect(result.current.progress.completed).toBe(3);
  });

  it('should use cached thumbnails when available', async () => {
    const file = createMockFile('cached.jpg');
    const cachedBlob = new Blob(['cached'], { type: 'image/jpeg' });
    getThumbnail.mockResolvedValue(cachedBlob);

    const { result } = renderHook(() => 
      useThumbnailQueue([file], { batchInterval: 100 })
    );

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(110);
    });

    expect(result.current.thumbnails.size).toBe(1);
    expect(generateClientThumbnail).not.toHaveBeenCalled();
  });

  it('should handle generation failures', async () => {
    const file = createMockFile('fail.jpg');
    generateClientThumbnail.mockRejectedValue(new Error('Failed'));

    const { result } = renderHook(() => 
      useThumbnailQueue([file], { batchInterval: 100 })
    );

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(110);
    });

    expect(result.current.thumbnails.size).toBe(0);
    expect(result.current.progress.failed).toBe(1);
    expect(result.current.progress.completed).toBe(1); // Failed counts as completed in progress bar
  });
});
