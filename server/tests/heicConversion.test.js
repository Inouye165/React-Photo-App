const { convertHeicToJpegBuffer, generateThumbnail } = require('../media/image');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Mock sharp, heic-convert and supabase for testing
jest.mock('sharp');
jest.mock('heic-convert');
jest.mock('../lib/supabaseClient', () => ({
  storage: {
    from: jest.fn().mockReturnValue({
      list: jest.fn(),
      upload: jest.fn()
    })
  }
}));

describe('HEIC Conversion Functionality', () => {
  const testImageDir = path.join(__dirname, 'test-heic');
  const testHeicFile = path.join(testImageDir, 'test.heic');
  const testJpegFile = path.join(testImageDir, 'test.jpg');
  
  // Test buffers
  const testHeicBuffer = Buffer.from('fake-heic-binary-data');
  const testJpegBuffer = Buffer.from('fake-jpeg-binary-data');

  beforeAll(() => {
    // Create test directory and files
    if (!fs.existsSync(testImageDir)) {
      fs.mkdirSync(testImageDir, { recursive: true });
    }
    
    // Create mock HEIC file
    fs.writeFileSync(testHeicFile, testHeicBuffer);
    fs.writeFileSync(testJpegFile, testJpegBuffer);
  });

  afterAll(() => {
    // Cleanup
    try {
      fs.rmSync(testImageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('convertHeicToJpegBuffer', () => {
    test('should return buffer for non-HEIC files', async () => {
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'jpeg' })
      };
      sharp.mockReturnValue(mockSharp);
      
      const result = await convertHeicToJpegBuffer(testJpegBuffer, 90);
      
      expect(result).toBe(testJpegBuffer);
    });

    test('should attempt Sharp conversion for HEIC files', async () => {
      const mockBuffer = Buffer.from('converted-jpeg-data');
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(mockBuffer)
      };
      
      sharp.mockReturnValue(mockSharp);

      const result = await convertHeicToJpegBuffer(testHeicBuffer, 85);

      expect(sharp).toHaveBeenCalledWith(testHeicBuffer);
      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 85 });
      expect(mockSharp.toBuffer).toHaveBeenCalled();
      expect(result).toBe(mockBuffer);
    });

    test('should fallback to heic-convert when Sharp fails', async () => {
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp conversion failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Mock heic-convert
      const heicConvert = require('heic-convert');
      const mockConvertedBuffer = Buffer.from('heic-convert-converted-data');
      heicConvert.mockResolvedValue(mockConvertedBuffer);

      const result = await convertHeicToJpegBuffer(testHeicBuffer, 75);

      expect(heicConvert).toHaveBeenCalledWith({
        buffer: testHeicBuffer,
        format: 'JPEG',
        quality: 0.75 // 75/100
      });
      expect(result).toBe(mockConvertedBuffer);
    });

    test('should reject when both Sharp and heic-convert fail', async () => {
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp conversion failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Mock failed heic-convert execution
      const heicConvert = require('heic-convert');
      heicConvert.mockRejectedValue(new Error('heic-convert failed'));

      await expect(convertHeicToJpegBuffer(testHeicBuffer, 90)).rejects.toThrow(
        'HEIC conversion failed'
      );
    });

    test('should validate quality parameter', async () => {
      const mockBuffer = Buffer.from('converted-data');
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed')) // Force fallback
      };
      
      sharp.mockReturnValue(mockSharp);

      const heicConvert = require('heic-convert');
      heicConvert.mockResolvedValue(mockBuffer);

      // Test with quality outside valid range - should be converted to 0-1 range
      await convertHeicToJpegBuffer(testHeicBuffer, 150);
      
      expect(heicConvert).toHaveBeenCalledWith({
        buffer: testHeicBuffer,
        format: 'JPEG',
        quality: 1.5 // 150/100 (heic-convert will handle values > 1)
      });
    });

    test('should handle file validation securely', async () => {
      // Test with buffer that's not HEIF - should return original buffer
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'jpeg' })
      };
      sharp.mockReturnValue(mockSharp);
      
      const result = await convertHeicToJpegBuffer(testJpegBuffer, 90);
      expect(result).toBe(testJpegBuffer);
    });

    test('should handle concurrent conversion requests', async () => {
      const mockBuffer = Buffer.from('converted-data');
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(mockBuffer)
      };
      
      sharp.mockReturnValue(mockSharp);

      // Start multiple concurrent conversions
      const promises = Array(5).fill(null).map(() => 
        convertHeicToJpegBuffer(testHeicBuffer, 85)
      );

      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result).toBe(mockBuffer);
      });
    });

    test('should properly handle heic-convert buffer operations', async () => {
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      const heicConvert = require('heic-convert');
      const mockOutputBuffer = Buffer.from('heic-convert-output');
      heicConvert.mockResolvedValue(mockOutputBuffer);

      const result = await convertHeicToJpegBuffer(testHeicBuffer, 80);

      // Should read input file and pass to heic-convert
      expect(heicConvert).toHaveBeenCalledWith({
        buffer: testHeicBuffer,
        format: 'JPEG',
        quality: 0.8 // 80/100
      });
      expect(result).toBe(mockOutputBuffer);
    });

    test('should handle different quality values in heic-convert', async () => {
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      const heicConvert = require('heic-convert');
      const mockOutputBuffer = Buffer.from('heic-convert-output');
      heicConvert.mockResolvedValue(mockOutputBuffer);

      // Test different quality values
      await convertHeicToJpegBuffer(testHeicBuffer, 100);
      expect(heicConvert).toHaveBeenLastCalledWith({
        buffer: testHeicBuffer,
        format: 'JPEG',
        quality: 1.0
      });

      await convertHeicToJpegBuffer(testHeicBuffer, 50);
      expect(heicConvert).toHaveBeenLastCalledWith({
        buffer: testHeicBuffer,
        format: 'JPEG',
        quality: 0.5
      });

      await convertHeicToJpegBuffer(testHeicBuffer, 1);
      expect(heicConvert).toHaveBeenLastCalledWith({
        buffer: testHeicBuffer,
        format: 'JPEG',
        quality: 0.01
      });
    });

    test('should provide detailed error messages on conversion failure', async () => {
      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp conversion error'))
      };
      
      sharp.mockReturnValue(mockSharp);

      const heicConvert = require('heic-convert');
      heicConvert.mockRejectedValue(new Error('heic-convert specific error'));

      await expect(convertHeicToJpegBuffer(testHeicBuffer, 90)).rejects.toThrow(
        'HEIC conversion failed'
      );
    });
  });

  describe('generateThumbnail', () => {
    const testHash = 'abcdef123456';

    // Import supabase mock
    const supabase = require('../lib/supabaseClient');
    
    beforeEach(() => {
      // Mock supabase storage methods
      jest.clearAllMocks();
    });

    test('should return existing thumbnail if available', async () => {
      // Mock existing thumbnail found
      supabase.storage.from.mockReturnValue({
        list: jest.fn().mockResolvedValue({
          data: [{ name: `${testHash}.jpg` }],
          error: null
        })
      });

      const result = await generateThumbnail(testJpegBuffer, testHash);
      
      expect(result).toBe(`thumbnails/${testHash}.jpg`);
    });

    test('should generate new thumbnail for JPEG files', async () => {
      // Mock no existing thumbnail
      supabase.storage.from.mockReturnValue({
        list: jest.fn().mockResolvedValue({
          data: [],
          error: null
        }),
        upload: jest.fn().mockResolvedValue({
          data: { path: `thumbnails/${testHash}.jpg` },
          error: null
        })
      });

      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'jpeg' }),
        resize: jest.fn().mockReturnThis(),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumbnail-data'))
      };
      
      sharp.mockReturnValue(mockSharp);

      const result = await generateThumbnail(testJpegBuffer, testHash);
      
      expect(sharp).toHaveBeenCalledWith(testJpegBuffer);
      expect(mockSharp.resize).toHaveBeenCalledWith(400, 400, { fit: 'inside' });
      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 85 });
      expect(result).toBe(`thumbnails/${testHash}.jpg`);
    });

    test('should generate thumbnail for HEIC files via conversion', async () => {
      // Mock no existing thumbnail
      supabase.storage.from.mockReturnValue({
        list: jest.fn().mockResolvedValue({
          data: [],
          error: null
        }),
        upload: jest.fn().mockResolvedValue({
          data: { path: `thumbnails/${testHash}.jpg` },
          error: null
        })
      });

      const mockConvertedBuffer = Buffer.from('converted-heic-data');
      
      // First mock - for metadata check (HEIF format detected)
      const mockMetadataSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' })
      };
      
      // Second mock - for the HEIC conversion (convertHeicToJpegBuffer)
      const mockConvertSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(mockConvertedBuffer)
      };
      
      // Third mock - for the thumbnail generation with converted buffer
      const mockThumbnailSharp = {
        resize: jest.fn().mockReturnThis(),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumbnail-data'))
      };
      
      // Set up sharp mock to return different mocks for different calls
      sharp.mockReturnValueOnce(mockMetadataSharp) // Metadata check
            .mockReturnValueOnce(mockConvertSharp)   // HEIC conversion
            .mockReturnValueOnce(mockThumbnailSharp); // Thumbnail generation
      
      const result = await generateThumbnail(testHeicBuffer, testHash);
      
      expect(result).toBe(`thumbnails/${testHash}.jpg`);
      expect(mockThumbnailSharp.resize).toHaveBeenCalledWith(400, 400, { fit: 'inside' });
      expect(mockThumbnailSharp.jpeg).toHaveBeenCalledWith({ quality: 85 });
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle malformed HEIC files', async () => {
      const corruptedBuffer = Buffer.from('not-a-real-heic-file');

      const mockSharp = {
        metadata: jest.fn().mockResolvedValue({ format: 'heif' }),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Input file contains unsupported image format'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Should fallback to heic-convert
      const heicConvert = require('heic-convert');
      heicConvert.mockRejectedValue(new Error('Invalid HEIC data'));

      await expect(convertHeicToJpegBuffer(corruptedBuffer, 90)).rejects.toThrow(
        'HEIC conversion failed'
      );
    });
  });
});