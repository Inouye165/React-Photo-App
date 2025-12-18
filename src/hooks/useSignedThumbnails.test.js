import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useSignedThumbnails from './useSignedThumbnails';
import { API_BASE_URL } from '../api';

describe('useSignedThumbnails Hook', () => {
  const mockToken = 'test-token-123';
  const mockPhotos = [
    { id: 1, thumbnail: '/display/thumbnails/hash1.jpg' },
    { id: 2, thumbnail: '/display/thumbnails/hash2.jpg' },
    { id: 3, thumbnail: '/display/thumbnails/hash3.jpg' },
  ];

  const mockPhotosAlreadySigned = [
    { id: 1, thumbnail: '/display/thumbnails/hash1.jpg?sig=test-sig&exp=123456' },
    { id: 2, thumbnail: '/display/thumbnails/hash2.jpg?sig=test-sig&exp=123456' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Success Cases', () => {
    it('should not fetch when thumbnails are already signed in /photos response', async () => {
      const { result } = renderHook(() => useSignedThumbnails(mockPhotosAlreadySigned, mockToken));

      // No per-photo signing calls needed
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);

      // getSignedUrl should return full URL with API base immediately
      const fullUrl = result.current.getSignedUrl(mockPhotosAlreadySigned[0]);
      expect(fullUrl).toBe(`${API_BASE_URL}/display/thumbnails/hash1.jpg?sig=test-sig&exp=123456`);
    });

    it('should fetch signed URLs for all photos with thumbnails', async () => {
      // Mock successful responses
      global.fetch.mockImplementation((url) => {
        const photoId = url.match(/photos\/(\d+)\/thumbnail-url/)[1];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            url: `/display/thumbnails/hash${photoId}.jpg?sig=test-sig&exp=123456`,
            expiresAt: 123456
          })
        });
      });

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, mockToken));

      // Should start loading
      expect(result.current.loading).toBe(true);

      // Wait for fetches to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have signed URLs for all photos
      expect(Object.keys(result.current.signedUrls)).toHaveLength(3);
      expect(result.current.signedUrls[1]).toBeDefined();
      expect(result.current.signedUrls[1].url).toContain('sig=test-sig');
      expect(result.current.error).toBeNull();

      // Should have called fetch for each photo
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should use getSignedUrl helper to construct full URLs', async () => {
      global.fetch.mockImplementation((url) => {
        const photoId = url.match(/photos\/(\d+)\/thumbnail-url/)[1];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            url: `/display/thumbnails/hash${photoId}.jpg?sig=test-sig&exp=123456`,
            expiresAt: 123456
          })
        });
      });

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // getSignedUrl should return full URL with API base
      const fullUrl = result.current.getSignedUrl(mockPhotos[0]);
      expect(fullUrl).toBe(`${API_BASE_URL}/display/thumbnails/hash1.jpg?sig=test-sig&exp=123456`);
    });

    it('should return null when signed URL not available (requires AuthenticatedImage)', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: 'Thumbnail not available' })
      });

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // getSignedUrl should return null when no signed URL is available
      // This signals to components that they need to use AuthenticatedImage
      const fallbackUrl = result.current.getSignedUrl(mockPhotos[0]);
      expect(fallbackUrl).toBeNull();
    });
  });

  describe('Error Handling - 4xx Responses', () => {
    it('should handle 404 gracefully with dev-only warning', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: 'Photo not found' })
      });

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not set error state for 404s
      expect(result.current.error).toBeNull();
      
      // signedUrls should be empty for 404
      expect(result.current.signedUrls[1]).toBeUndefined();

      consoleWarnSpy.mockRestore();
    });

    it('should handle 403 gracefully as client error', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      global.fetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ success: false, error: 'Forbidden' })
      });

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 403 should be treated as expected client error
      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(result.current.error).toBeNull();

      consoleDebugSpy.mockRestore();
    });

    it('should handle 401 gracefully (auth issues handled elsewhere)', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      global.fetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: 'Unauthorized' })
      });

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(result.current.error).toBeNull();

      consoleDebugSpy.mockRestore();
    });
  });

  describe('Error Handling - 5xx Responses', () => {
    it('should log 500 errors as actual errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error');

      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: 'Internal server error' })
      });

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 500 should be logged as error
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Server error fetching thumbnail URL for photo 1'),
        500
      );

      // Should not crash or set error state (individual photo errors shouldn't break the whole hook)
      expect(result.current.error).toBeNull();

      consoleSpy.mockRestore();
    });
  });

  describe('Network Errors', () => {
    it('should handle network errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error');

      global.fetch.mockRejectedValue(new Error('Network connection failed'));

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should log network errors
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching thumbnail URL for photo'),
        expect.stringContaining('Network connection failed')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty photos array', async () => {
      const { result } = renderHook(() => useSignedThumbnails([], mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.signedUrls).toEqual({});
      expect(result.current.error).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle null/undefined token', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      const { result } = renderHook(() => useSignedThumbnails(mockPhotos, null));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.signedUrls).toEqual({});
      expect(global.fetch).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should skip photos without thumbnails', async () => {
      const photosWithoutThumbnails = [
        { id: 1, thumbnail: null },
        { id: 2, thumbnail: '/display/thumbnails/hash2.jpg' },
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          url: '/display/thumbnails/hash2.jpg?sig=test-sig&exp=123456',
          expiresAt: 123456
        })
      });

      const { result } = renderHook(() => useSignedThumbnails(photosWithoutThumbnails, mockToken));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should only fetch for photo with thumbnail
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.signedUrls[1]).toBeUndefined();
      expect(result.current.signedUrls[2]).toBeDefined();
    });

    it('should return null from getSignedUrl for invalid photo', () => {
      const { result } = renderHook(() => useSignedThumbnails([], mockToken));

      expect(result.current.getSignedUrl(null)).toBeNull();
      expect(result.current.getSignedUrl({})).toBeNull();
      expect(result.current.getSignedUrl({ id: 1 })).toBeNull();
    });
  });

  describe('Caching and Deduplication', () => {
    it('should not fetch same photo twice', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          url: '/display/thumbnails/hash1.jpg?sig=test-sig&exp=123456',
          expiresAt: 123456
        })
      });

      const { result, rerender } = renderHook(
        ({ photos, token }) => useSignedThumbnails(photos, token),
        { initialProps: { photos: mockPhotos, token: mockToken } }
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialCallCount = global.fetch.mock.calls.length;

      // Rerender with same photos
      rerender({ photos: mockPhotos, token: mockToken });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not fetch again
      expect(global.fetch).toHaveBeenCalledTimes(initialCallCount);
    });
  });
});
