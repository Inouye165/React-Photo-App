const { convertHeicToJpegBuffer, generateThumbnail } = require('../media/image');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Mock sharp and heic-convert for testing
jest.mock('sharp');
jest.mock('heic-convert');

describe('HEIC Conversion Functionality', () => {
  const testImageDir = path.join(__dirname, 'test-heic');
  const testHeicFile = path.join(testImageDir, 'test.heic');
  const testJpegFile = path.join(testImageDir, 'test.jpg');

  beforeAll(() => {
    // Create test directory and files
    if (!fs.existsSync(testImageDir)) {
      fs.mkdirSync(testImageDir, { recursive: true });
    }
    
    // Create mock HEIC file
    fs.writeFileSync(testHeicFile, 'fake-heic-binary-data');
    fs.writeFileSync(testJpegFile, 'fake-jpeg-binary-data');
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
      const result = await convertHeicToJpegBuffer(testJpegFile, 90);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('fake-jpeg-binary-data');
    });

    test('should attempt Sharp conversion for HEIC files', async () => {
      const mockBuffer = Buffer.from('converted-jpeg-data');
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(mockBuffer)
      };
      
      sharp.mockReturnValue(mockSharp);

      const result = await convertHeicToJpegBuffer(testHeicFile, 85);

      expect(sharp).toHaveBeenCalledWith(testHeicFile);
      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 85 });
      expect(mockSharp.toBuffer).toHaveBeenCalled();
      expect(result).toBe(mockBuffer);
    });

    test('should fallback to heic-convert when Sharp fails', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp conversion failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Mock heic-convert
      const heicConvert = require('heic-convert');
      const mockConvertedBuffer = Buffer.from('heic-convert-converted-data');
      heicConvert.mockResolvedValue(mockConvertedBuffer);

      const result = await convertHeicToJpegBuffer(testHeicFile, 75);

      expect(heicConvert).toHaveBeenCalledWith({
        buffer: expect.any(Buffer),
        format: 'JPEG',
        quality: 0.75 // 75/100
      });
      expect(result).toBe(mockConvertedBuffer);
    });

    test('should reject when both Sharp and heic-convert fail', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Mock failed heic-convert execution
      const heicConvert = require('heic-convert');
      heicConvert.mockRejectedValue(new Error('heic-convert failed'));

      await expect(convertHeicToJpegBuffer(testHeicFile, 90)).rejects.toThrow(
        'HEIC conversion failed for'
      );
    });

    test('should validate quality parameter', async () => {
      const mockBuffer = Buffer.from('converted-data');
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed')) // Force fallback
      };
      
      sharp.mockReturnValue(mockSharp);

      const heicConvert = require('heic-convert');
      heicConvert.mockResolvedValue(mockBuffer);

      // Test with quality outside valid range - should be converted to 0-1 range
      await convertHeicToJpegBuffer(testHeicFile, 150);
      
      expect(heicConvert).toHaveBeenCalledWith({
        buffer: expect.any(Buffer),
        format: 'JPEG',
        quality: 1.5 // 150/100 (heic-convert will handle values > 1)
      });
    });

    test('should handle file validation securely', async () => {
      // Test with non-existent file
      await expect(convertHeicToJpegBuffer('/nonexistent/file.heic', 90)).rejects.toThrow();

      // Test with invalid extension (should return original buffer)
      const result = await convertHeicToJpegBuffer(testJpegFile, 90);
      expect(result.toString()).toBe('fake-jpeg-binary-data');
    });

    test('should handle concurrent conversion requests', async () => {
      const mockBuffer = Buffer.from('converted-data');
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(mockBuffer)
      };
      
      sharp.mockReturnValue(mockSharp);

      // Start multiple concurrent conversions
      const promises = Array(5).fill(null).map(() => 
        convertHeicToJpegBuffer(testHeicFile, 85)
      );

      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result).toBe(mockBuffer);
      });
    });

    test('should properly handle heic-convert buffer operations', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      const heicConvert = require('heic-convert');
      const mockOutputBuffer = Buffer.from('heic-convert-output');
      heicConvert.mockResolvedValue(mockOutputBuffer);

      const result = await convertHeicToJpegBuffer(testHeicFile, 80);

      // Should read input file and pass to heic-convert
      expect(heicConvert).toHaveBeenCalledWith({
        buffer: expect.any(Buffer),
        format: 'JPEG',
        quality: 0.8 // 80/100
      });
      expect(result).toBe(mockOutputBuffer);
    });

    test('should handle different quality values in heic-convert', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      const heicConvert = require('heic-convert');
      const mockOutputBuffer = Buffer.from('heic-convert-output');
      heicConvert.mockResolvedValue(mockOutputBuffer);

      // Test different quality values
      const fileBuffer = fs.readFileSync(testHeicFile);
      await convertHeicToJpegBuffer(fileBuffer, 100);
      expect(heicConvert).toHaveBeenLastCalledWith({
        buffer: expect.any(Buffer),
        format: 'JPEG',
        quality: 1.0
      });

      await convertHeicToJpegBuffer(fileBuffer, 50);
      expect(heicConvert).toHaveBeenLastCalledWith({
        buffer: expect.any(Buffer),
        format: 'JPEG',
        quality: 0.5
      });

      await convertHeicToJpegBuffer(testHeicFile, 1);
      expect(heicConvert).toHaveBeenLastCalledWith({
        buffer: expect.any(Buffer),
        format: 'JPEG',
        quality: 0.01
      });
    });

    test('should provide detailed error messages on conversion failure', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp conversion error'))
      };
      
      sharp.mockReturnValue(mockSharp);

      const heicConvert = require('heic-convert');
      heicConvert.mockRejectedValue(new Error('heic-convert specific error'));

      await expect(convertHeicToJpegBuffer(testHeicFile, 90)).rejects.toThrow(
        'HEIC conversion failed. Sharp error:'
      );
      
      await expect(convertHeicToJpegBuffer(testHeicFile, 90)).rejects.toThrow(
        'Sharp error: Sharp conversion error'
      );
      
      await expect(convertHeicToJpegBuffer(testHeicFile, 90)).rejects.toThrow(
        'Fallback error: heic-convert specific error'
      );
    });
  });

  describe('generateThumbnail', () => {
    const thumbDir = path.join(testImageDir, 'thumbnails');
    const testHash = 'abcdef123456';

    beforeEach(() => {
      if (!fs.existsSync(thumbDir)) {
        fs.mkdirSync(thumbDir, { recursive: true });
      }
    });

    test('should return existing thumbnail if available', async () => {
      const existingThumbPath = path.join(thumbDir, `${testHash}.jpg`);
      fs.writeFileSync(existingThumbPath, 'existing-thumbnail');

      const result = await generateThumbnail(testJpegFile, testHash, thumbDir);
      
      expect(result).toBe(existingThumbPath);
    });

    test('should generate new thumbnail for JPEG files', async () => {
      const mockSharp = {
        resize: jest.fn().mockReturnThis(),
        jpeg: jest.fn().mockReturnThis(),
        toFile: jest.fn().mockResolvedValue()
      };
      
      sharp.mockReturnValue(mockSharp);

      const result = await generateThumbnail(testJpegFile, 'newthumb123', thumbDir);
      
      expect(sharp).toHaveBeenCalledWith(testJpegFile);
      expect(mockSharp.resize).toHaveBeenCalledWith(90, 90, { fit: 'inside' });
      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 70 });
      expect(result).toBe(path.join(thumbDir, 'newthumb123.jpg'));
    });

    test('should generate thumbnail for HEIC files via conversion', async () => {
      const mockConvertedBuffer = Buffer.from('converted-heic-data');
      
      // First mock - for the convertHeicToJpegBuffer call (should succeed to return buffer)
      const mockConvertSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(mockConvertedBuffer)
      };
      
      // Second mock - for the thumbnail generation with buffer (should succeed)
      const mockThumbnailSharp = {
        resize: jest.fn().mockReturnThis(),
        jpeg: jest.fn().mockReturnThis(),
        toFile: jest.fn().mockResolvedValue()
      };
      
      // Set up sharp mock to return different mocks for different calls
      sharp.mockReturnValueOnce(mockConvertSharp) // First call in convertHeicToJpegBuffer
            .mockReturnValueOnce(mockThumbnailSharp); // Second call in generateThumbnail
      
      const result = await generateThumbnail(testHeicFile, 'heicthumb123', thumbDir);
      
      expect(result).toBe(path.join(thumbDir, 'heicthumb123.jpg'));
      expect(mockThumbnailSharp.resize).toHaveBeenCalledWith(90, 90, { fit: 'inside' });
      expect(mockThumbnailSharp.jpeg).toHaveBeenCalledWith({ quality: 70 });
      expect(mockThumbnailSharp.toFile).toHaveBeenCalled();
    });

    test('should handle thumbnail generation failures gracefully', async () => {
      const mockSharp = {
        resize: jest.fn().mockReturnThis(),
        jpeg: jest.fn().mockReturnThis(),
        toFile: jest.fn().mockRejectedValue(new Error('Sharp thumbnail failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      const result = await generateThumbnail(testJpegFile, 'failthumb123', thumbDir);
      
      expect(result).toBeNull();
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle permission errors', async () => {
      // Mock fs.readFile to throw permission error
      const originalReadFile = fs.readFileSync;
      fs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      await expect(convertHeicToJpegBuffer('/protected/file.heic', 90)).rejects.toThrow();

      // Restore original function
      fs.readFileSync = originalReadFile;
    });

    test('should handle disk space errors during conversion', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('ENOSPC: no space left'))
      };
      
      sharp.mockReturnValue(mockSharp);

      await expect(convertHeicToJpegBuffer(testHeicFile, 90)).rejects.toThrow();
    });

    test('should handle malformed HEIC files', async () => {
      const corruptedHeicFile = path.join(testImageDir, 'corrupted.heic');
      fs.writeFileSync(corruptedHeicFile, 'not-a-real-heic-file');

      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Input file contains unsupported image format'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Should fallback to heic-convert
      const heicConvert = require('heic-convert');
      heicConvert.mockRejectedValue(new Error('Invalid HEIC data'));

      await expect(convertHeicToJpegBuffer(corruptedHeicFile, 90)).rejects.toThrow(
        'HEIC conversion failed. Sharp error:'
      );
    });
  });
});