/**
 * Unit Tests for Client-Side Image Processing Utility
 * 
 * Strategy: Mock DOM APIs (createImageBitmap, HTMLCanvasElement) since
 * Canvas operations are difficult to test in JSDOM/Vitest environments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateClientThumbnail,
  isSupportedImageType,
  calculateScaledDimensions,
} from './clientImageProcessing.js';

// Helper to create a mock File
function createMockFile(type, name = 'test-image') {
  const blob = new Blob(['fake image data'], { type });
  return new File([blob], name, { type });
}

describe('clientImageProcessing', () => {
  describe('isSupportedImageType', () => {
    it('should return true for supported image types', () => {
      expect(isSupportedImageType(createMockFile('image/jpeg'))).toBe(true);
      expect(isSupportedImageType(createMockFile('image/png'))).toBe(true);
      expect(isSupportedImageType(createMockFile('image/webp'))).toBe(true);
      expect(isSupportedImageType(createMockFile('image/gif'))).toBe(true);
      expect(isSupportedImageType(createMockFile('image/bmp'))).toBe(true);
    });

    it('should return false for unsupported image types', () => {
      expect(isSupportedImageType(createMockFile('image/heic'))).toBe(false);
      expect(isSupportedImageType(createMockFile('image/heif'))).toBe(false);
      expect(isSupportedImageType(createMockFile('image/tiff'))).toBe(false);
      expect(isSupportedImageType(createMockFile('video/mp4'))).toBe(false);
      expect(isSupportedImageType(createMockFile('application/pdf'))).toBe(false);
    });

    it('should return false for null/undefined/invalid file', () => {
      expect(isSupportedImageType(null)).toBe(false);
      expect(isSupportedImageType(undefined)).toBe(false);
      expect(isSupportedImageType({})).toBe(false);
      expect(isSupportedImageType({ type: '' })).toBe(false);
    });
  });

  describe('calculateScaledDimensions', () => {
    it('should not scale images smaller than max dimension', () => {
      expect(calculateScaledDimensions(200, 150, 400)).toEqual({ width: 200, height: 150 });
      expect(calculateScaledDimensions(400, 400, 400)).toEqual({ width: 400, height: 400 });
    });

    it('should scale landscape images correctly', () => {
      const result = calculateScaledDimensions(800, 600, 400);
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    });

    it('should scale portrait images correctly', () => {
      const result = calculateScaledDimensions(600, 800, 400);
      expect(result.width).toBe(300);
      expect(result.height).toBe(400);
    });

    it('should scale square images correctly', () => {
      const result = calculateScaledDimensions(1000, 1000, 400);
      expect(result.width).toBe(400);
      expect(result.height).toBe(400);
    });

    it('should handle very large images', () => {
      const result = calculateScaledDimensions(4000, 3000, 400);
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    });
  });

  describe('generateClientThumbnail', () => {
    let originalCreateImageBitmap;
    let originalCreateElement;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;

    beforeEach(() => {
      // Store originals
      originalCreateImageBitmap = globalThis.createImageBitmap;
      originalCreateElement = document.createElement;
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;

      // Mock URL methods
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      // Restore originals
      globalThis.createImageBitmap = originalCreateImageBitmap;
      document.createElement = originalCreateElement;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.clearAllMocks();
    });

    it('should return null immediately for unsupported types (HEIC)', async () => {
      const heicFile = createMockFile('image/heic', 'test.heic');
      
      // createImageBitmap should NOT be called for unsupported types
      const mockCreateImageBitmap = vi.fn();
      globalThis.createImageBitmap = mockCreateImageBitmap;

      const result = await generateClientThumbnail(heicFile);

      expect(result).toBeNull();
      expect(mockCreateImageBitmap).not.toHaveBeenCalled();
    });

    it('should return null immediately for TIFF files', async () => {
      const tiffFile = createMockFile('image/tiff', 'test.tiff');
      
      const mockCreateImageBitmap = vi.fn();
      globalThis.createImageBitmap = mockCreateImageBitmap;

      const result = await generateClientThumbnail(tiffFile);

      expect(result).toBeNull();
      expect(mockCreateImageBitmap).not.toHaveBeenCalled();
    });

    it('should return null immediately for video files', async () => {
      const videoFile = createMockFile('video/mp4', 'test.mp4');
      
      const mockCreateImageBitmap = vi.fn();
      globalThis.createImageBitmap = mockCreateImageBitmap;

      const result = await generateClientThumbnail(videoFile);

      expect(result).toBeNull();
      expect(mockCreateImageBitmap).not.toHaveBeenCalled();
    });

    it('should attempt to process valid JPEG files using createImageBitmap', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      // Mock createImageBitmap
      const mockImageBitmap = {
        width: 800,
        height: 600,
        close: vi.fn(),
      };
      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockImageBitmap);

      // Mock canvas
      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(mockBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await generateClientThumbnail(jpegFile);

      expect(globalThis.createImageBitmap).toHaveBeenCalledWith(jpegFile);
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
      expect(mockContext.drawImage).toHaveBeenCalled();
      expect(mockCanvas.toBlob).toHaveBeenCalled();
      expect(mockImageBitmap.close).toHaveBeenCalled(); // Memory cleanup
      expect(result).toBe(mockBlob);
    });

    it('should use canvas dimensions based on aspect ratio (landscape)', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      // Mock createImageBitmap with landscape dimensions
      const mockImageBitmap = {
        width: 1600,
        height: 1200,
        close: vi.fn(),
      };
      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockImageBitmap);

      // Mock canvas
      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(mockBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      await generateClientThumbnail(jpegFile);

      // Should be scaled to 400x300 (maintaining 4:3 aspect ratio)
      expect(mockCanvas.width).toBe(400);
      expect(mockCanvas.height).toBe(300);
    });

    it('should return null when canvas context fails', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');

      // Mock createImageBitmap
      const mockImageBitmap = {
        width: 800,
        height: 600,
        close: vi.fn(),
      };
      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockImageBitmap);

      // Mock canvas with null context (simulates canvas error)
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => null), // Context creation fails
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await generateClientThumbnail(jpegFile);

      expect(result).toBeNull();
      expect(mockImageBitmap.close).toHaveBeenCalled(); // Should still cleanup
    });

    it('should return null when createImageBitmap throws and fallback fails', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');

      // Mock createImageBitmap to throw
      globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('Decode error'));

      // Mock Image element that also fails
      const mockImage = {
        set src(url) {
          // Trigger error after setting src
          setTimeout(() => this.onerror && this.onerror(new Error('Load failed')), 0);
        },
        get src() {
          return '';
        },
        onload: null,
        onerror: null,
      };

      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn(),
          };
        }
        return mockImage;
      });

      // Mock Image constructor
      const originalImage = globalThis.Image;
      globalThis.Image = vi.fn(() => mockImage);

      const result = await generateClientThumbnail(jpegFile);

      expect(result).toBeNull();

      // Restore
      globalThis.Image = originalImage;
    });

    it('should handle toBlob returning null', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');

      // Mock createImageBitmap
      const mockImageBitmap = {
        width: 800,
        height: 600,
        close: vi.fn(),
      };
      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockImageBitmap);

      // Mock canvas with toBlob returning null
      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(null)), // toBlob fails
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await generateClientThumbnail(jpegFile);

      expect(result).toBeNull();
    });

    it('should cleanup ImageBitmap after successful processing', async () => {
      const pngFile = createMockFile('image/png', 'test.png');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      const mockImageBitmap = {
        width: 500,
        height: 500,
        close: vi.fn(),
      };
      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockImageBitmap);

      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(mockBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      await generateClientThumbnail(pngFile);

      // Verify cleanup was called
      expect(mockImageBitmap.close).toHaveBeenCalled();
    });

    it('should process WebP files correctly', async () => {
      const webpFile = createMockFile('image/webp', 'test.webp');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      const mockImageBitmap = {
        width: 1000,
        height: 750,
        close: vi.fn(),
      };
      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockImageBitmap);

      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(mockBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await generateClientThumbnail(webpFile);

      expect(result).toBe(mockBlob);
      expect(globalThis.createImageBitmap).toHaveBeenCalledWith(webpFile);
    });
  });
});
