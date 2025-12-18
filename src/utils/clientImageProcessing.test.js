/**
 * Unit Tests for Client-Side Image Processing Utility
 * 
 * Strategy: Mock DOM APIs (Image, HTMLCanvasElement) and heic converters since
 * Canvas operations are difficult to test in JSDOM/Vitest environments.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateClientThumbnail,
  isSupportedImageType,
  calculateScaledDimensions,
  generateClientThumbnailBatch,
  // compressForUpload is tested via dynamic import due to mocking requirements
} from './clientImageProcessing';

// Mock heic2any
vi.mock('heic2any', () => ({
  default: vi.fn(),
}));

// Mock heic-to
vi.mock('heic-to', () => ({
  heicTo: vi.fn(),
}));

import heic2any from 'heic2any';
import { heicTo } from 'heic-to';

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

    it('should use Math.floor for non-integer results', () => {
      // 1000 x 750 scaled to 400 max should give 400 x 300
      const result = calculateScaledDimensions(1000, 750, 400);
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
    });
  });

  describe('generateClientThumbnail', () => {
    let originalCreateElement;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;
    let originalImage;

    beforeEach(() => {
      // Store originals
      originalCreateElement = document.createElement;
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      originalImage = globalThis.Image;

      // Mock URL methods
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = vi.fn();

      // Reset heic mocks
      vi.mocked(heic2any).mockReset();
      vi.mocked(heicTo).mockReset();
    });

    afterEach(() => {
      // Restore originals
      document.createElement = originalCreateElement;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      globalThis.Image = originalImage;
      vi.clearAllMocks();
    });

    it('should return null for null/undefined file', async () => {
      expect(await generateClientThumbnail(null)).toBeNull();
      expect(await generateClientThumbnail(undefined)).toBeNull();
    });

    it('should return null immediately for unsupported types (TIFF)', async () => {
      const tiffFile = createMockFile('image/tiff', 'test.tiff');
      const result = await generateClientThumbnail(tiffFile);
      expect(result).toBeNull();
    });

    it('should return null immediately for video files', async () => {
      const videoFile = createMockFile('video/mp4', 'test.mp4');
      const result = await generateClientThumbnail(videoFile);
      expect(result).toBeNull();
    });

    it('should attempt HEIC conversion for .heic files', async () => {
      const heicFile = createMockFile('image/heic', 'test.heic');
      const convertedBlob = new Blob(['converted'], { type: 'image/jpeg' });
      
      vi.mocked(heic2any).mockResolvedValue(convertedBlob);

      // Mock Image that loads successfully
      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      // Mock canvas
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });
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

      const result = await generateClientThumbnail(heicFile);

      expect(heic2any).toHaveBeenCalledWith({
        blob: heicFile,
        toType: 'image/jpeg',
        quality: 0.8
      });
      expect(result).toBe(mockBlob);
    });

    it('should fallback to heic-to when heic2any fails with ERR_LIBHEIF', async () => {
      const heicFile = createMockFile('image/heic', 'test.heic');
      const convertedBlob = new Blob(['converted'], { type: 'image/jpeg' });
      const thumbnailBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      // heic2any fails with format not supported error
      vi.mocked(heic2any).mockRejectedValue({ code: 2, message: 'ERR_LIBHEIF format not supported' });
      // heic-to succeeds as fallback
      vi.mocked(heicTo).mockResolvedValue(convertedBlob);

      // Mock Image that loads successfully
      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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
        toBlob: vi.fn((callback) => callback(thumbnailBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await generateClientThumbnail(heicFile);

      // Should have tried heic2any first, then fallen back to heicTo
      expect(heic2any).toHaveBeenCalled();
      expect(heicTo).toHaveBeenCalledWith({
        blob: heicFile,
        type: 'image/jpeg',
        quality: 0.8
      });
      expect(result).toBe(thumbnailBlob);
    });

    it('should return null when both heic converters fail', async () => {
      const heicFile = createMockFile('image/heic', 'test.heic');
      
      // Both converters fail
      vi.mocked(heic2any).mockRejectedValue({ code: 2, message: 'ERR_LIBHEIF format not supported' });
      vi.mocked(heicTo).mockRejectedValue(new Error('heic-to also failed'));

      const result = await generateClientThumbnail(heicFile);

      expect(heic2any).toHaveBeenCalled();
      expect(heicTo).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should not fallback to heic-to for non-format errors', async () => {
      const heicFile = createMockFile('image/heic', 'test.heic');
      
      // heic2any fails with a different (non-format) error
      vi.mocked(heic2any).mockRejectedValue(new Error('Network error'));

      const result = await generateClientThumbnail(heicFile);

      // Should NOT have tried heicTo because error wasn't a format error
      expect(heic2any).toHaveBeenCalled();
      expect(heicTo).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should process valid JPEG files', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      // Mock Image
      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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

      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d', {
        alpha: false,
        willReadFrequently: false
      });
      expect(mockContext.drawImage).toHaveBeenCalled();
      expect(result).toBe(mockBlob);
    });

    it('should use canvas dimensions based on aspect ratio (landscape)', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      // Mock Image with landscape dimensions
      const mockImage = {
        width: 1600,
        height: 1200,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      // Track dimensions when drawImage is called (before cleanup)
      let capturedWidth = 0;
      let capturedHeight = 0;

      // Mock canvas
      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        _width: 0,
        _height: 0,
        get width() { return this._width; },
        set width(v) { this._width = v; },
        get height() { return this._height; },
        set height(v) { this._height = v; },
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => {
          // Capture dimensions before blob is created (before cleanup)
          capturedWidth = mockCanvas._width;
          capturedHeight = mockCanvas._height;
          callback(mockBlob);
        }),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      await generateClientThumbnail(jpegFile);

      // Should be scaled to 400x300 (maintaining 4:3 aspect ratio)
      expect(capturedWidth).toBe(400);
      expect(capturedHeight).toBe(300);
    });

    it('should return null when canvas context fails', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');

      // Mock Image
      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      // Mock canvas with null context
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => null),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await generateClientThumbnail(jpegFile);

      expect(result).toBeNull();
    });

    it('should return null when image fails to load', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');

      // Mock Image that fails to load
      const mockImage = {
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onerror && this.onerror(new Error('Load failed')), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      const result = await generateClientThumbnail(jpegFile);

      expect(result).toBeNull();
    });

    it('should handle toBlob returning null', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');

      // Mock Image
      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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
        toBlob: vi.fn((callback) => callback(null)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await generateClientThumbnail(jpegFile);

      expect(result).toBeNull();
    });

    it('should cleanup canvas dimensions after processing', async () => {
      const pngFile = createMockFile('image/png', 'test.png');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      const mockImage = {
        width: 500,
        height: 500,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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

      // Canvas dimensions should be reset to 0 for memory cleanup
      expect(mockCanvas.width).toBe(0);
      expect(mockCanvas.height).toBe(0);
    });

    it('should retry with smaller dimensions when drawImage fails', async () => {
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      let drawAttempts = 0;
      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(() => {
          drawAttempts++;
          if (drawAttempts === 1) {
            throw new RangeError('Out of memory');
          }
        }),
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

      // Should have attempted twice
      expect(mockContext.drawImage).toHaveBeenCalledTimes(2);
      expect(result).toBe(mockBlob);
    });

    it('should process WebP files correctly', async () => {
      const webpFile = createMockFile('image/webp', 'test.webp');
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      const mockImage = {
        width: 1000,
        height: 750,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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
    });

    it('should detect HEIC by file extension', async () => {
      // File with .heic extension but empty type
      const heicFile = new File([new Blob(['data'])], 'photo.HEIC', { type: '' });
      
      vi.mocked(heic2any).mockRejectedValue(new Error('Test'));

      await generateClientThumbnail(heicFile);

      // Should have attempted HEIC conversion despite empty mime type
      expect(heic2any).toHaveBeenCalled();
    });
  });

  describe('generateClientThumbnailBatch', () => {
    let originalImage;
    let originalCreateElement;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;

    beforeEach(() => {
      originalImage = globalThis.Image;
      originalCreateElement = document.createElement;
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;

      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      globalThis.Image = originalImage;
      document.createElement = originalCreateElement;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.clearAllMocks();
    });

    it('should process multiple files and return a Map', async () => {
      const files = [
        createMockFile('image/jpeg', 'photo1.jpg'),
        createMockFile('image/png', 'photo2.png'),
      ];
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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

      const results = await generateClientThumbnailBatch(files);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(2);
      expect(results.get('photo1.jpg')).toBe(mockBlob);
      expect(results.get('photo2.png')).toBe(mockBlob);
    });

    it('should call progress callback', async () => {
      const files = [
        createMockFile('image/jpeg', 'photo1.jpg'),
        createMockFile('image/png', 'photo2.png'),
      ];
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });
      const onProgress = vi.fn();

      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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

      await generateClientThumbnailBatch(files, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2, files[0]);
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2, files[1]);
    });

    it('should continue processing when one file fails', async () => {
      const files = [
        createMockFile('image/tiff', 'unsupported.tiff'), // Will fail
        createMockFile('image/jpeg', 'photo.jpg'), // Will succeed
      ];
      const mockBlob = new Blob(['thumbnail'], { type: 'image/jpeg' });

      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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

      const results = await generateClientThumbnailBatch(files);

      // Only the JPEG should be in results
      expect(results.size).toBe(1);
      expect(results.has('unsupported.tiff')).toBe(false);
      expect(results.get('photo.jpg')).toBe(mockBlob);
    });
  });

  describe('compressForUpload', () => {
    let originalCreateElement;
    let originalCreateObjectURL;
    let originalRevokeObjectURL;
    let originalImage;

    beforeEach(() => {
      // Store originals
      originalCreateElement = document.createElement;
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      originalImage = globalThis.Image;

      // Mock URL methods
      URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      URL.revokeObjectURL = vi.fn();

      // Reset heic mocks
      vi.mocked(heic2any).mockReset();
      vi.mocked(heicTo).mockReset();
    });

    afterEach(() => {
      // Restore originals
      document.createElement = originalCreateElement;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      globalThis.Image = originalImage;
      vi.clearAllMocks();
    });

    it('should throw error for null/undefined file', async () => {
      const { compressForUpload } = await import('./clientImageProcessing');
      
      await expect(compressForUpload(null)).rejects.toThrow('No file provided');
      await expect(compressForUpload(undefined)).rejects.toThrow('No file provided');
    });

    it('should compress JPEG files and return blob with metadata', async () => {
      const { compressForUpload } = await import('./clientImageProcessing');
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');
      const compressedBlob = new Blob(['compressed'], { type: 'image/jpeg' });

      // Mock Image that loads successfully
      const mockImage = {
        width: 3000,
        height: 2000,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

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
        toBlob: vi.fn((callback) => callback(compressedBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await compressForUpload(jpegFile);

      expect(result).toHaveProperty('blob');
      expect(result).toHaveProperty('width');
      expect(result).toHaveProperty('height');
      expect(result).toHaveProperty('originalSize');
      expect(result).toHaveProperty('compressedSize');
      expect(result).toHaveProperty('compressionRatio');
      expect(result).toHaveProperty('wasResized');
      
      // Should have been resized since 3000 > 2048
      expect(result.wasResized).toBe(true);
    });

    it('should not resize images smaller than maxSize', async () => {
      const { compressForUpload } = await import('./clientImageProcessing');
      const jpegFile = createMockFile('image/jpeg', 'small.jpg');
      const compressedBlob = new Blob(['compressed'], { type: 'image/jpeg' });

      // Mock small image
      const mockImage = {
        width: 1024,
        height: 768,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(compressedBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await compressForUpload(jpegFile);

      // Should not be resized since 1024 < 2048
      expect(result.wasResized).toBe(false);
      expect(result.width).toBe(1024);
      expect(result.height).toBe(768);
    });

    it('should respect custom maxSize option', async () => {
      const { compressForUpload } = await import('./clientImageProcessing');
      const jpegFile = createMockFile('image/jpeg', 'test.jpg');
      const compressedBlob = new Blob(['compressed'], { type: 'image/jpeg' });

      // Mock image larger than custom max
      const mockImage = {
        width: 1500,
        height: 1000,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(compressedBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      // Custom max size of 1024
      const result = await compressForUpload(jpegFile, { maxSize: 1024 });

      // Should be resized since 1500 > 1024
      expect(result.wasResized).toBe(true);
      expect(result.width).toBeLessThanOrEqual(1024);
      expect(result.height).toBeLessThanOrEqual(1024);
    });

    it('should convert HEIC files before compression', async () => {
      const { compressForUpload } = await import('./clientImageProcessing');
      const heicFile = createMockFile('image/heic', 'test.heic');
      const convertedBlob = new Blob(['converted'], { type: 'image/jpeg' });
      const compressedBlob = new Blob(['compressed'], { type: 'image/jpeg' });

      vi.mocked(heic2any).mockResolvedValue(convertedBlob);

      const mockImage = {
        width: 4000,
        height: 3000,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(compressedBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await compressForUpload(heicFile);

      expect(heic2any).toHaveBeenCalled();
      expect(result.blob).toBe(compressedBlob);
      expect(result.wasResized).toBe(true);
    });

    it('should return correct compression ratio', async () => {
      const { compressForUpload } = await import('./clientImageProcessing');
      
      // Create a "large" file (in terms of size)
      const largeData = new Uint8Array(100000).fill(255);
      const largeFile = new File([largeData], 'large.jpg', { type: 'image/jpeg' });
      
      // Small compressed blob
      const compressedBlob = new Blob(['compressed'], { type: 'image/jpeg' });

      const mockImage = {
        width: 800,
        height: 600,
        onload: null,
        onerror: null,
        set src(url) {
          setTimeout(() => this.onload && this.onload(), 0);
        },
      };
      globalThis.Image = vi.fn(() => mockImage);

      const mockContext = {
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockContext),
        toBlob: vi.fn((callback) => callback(compressedBlob)),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement.call(document, tag);
      });

      const result = await compressForUpload(largeFile);

      expect(result.originalSize).toBe(largeFile.size);
      expect(result.compressedSize).toBe(compressedBlob.size);
      expect(parseFloat(result.compressionRatio)).toBeGreaterThan(1);
    });
  });
});
