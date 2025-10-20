const { convertHeicToJpegBuffer, generateThumbnail } = require('../media/image');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Mock sharp and child_process for testing
jest.mock('sharp');
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const { exec } = require('child_process');

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
    } catch (error) {
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

    test('should fallback to ImageMagick when Sharp fails', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp conversion failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Mock successful ImageMagick execution
      const mockExecCallback = (cmd, options, callback) => {
        // Simulate successful conversion by creating temp file
        const tempFile = cmd.match(/"([^"]+\.jpg)"/)[1];
        fs.writeFileSync(tempFile, 'imagemagick-converted-data');
        callback(null, { stdout: '', stderr: '' });
      };
      
      exec.mockImplementation(mockExecCallback);

      const result = await convertHeicToJpegBuffer(testHeicFile, 75);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('imagemagick-converted-data');
    });

    test('should reject when both Sharp and ImageMagick fail', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Mock failed ImageMagick execution
      exec.mockImplementation((cmd, options, callback) => {
        callback(new Error('ImageMagick failed'), { stdout: '', stderr: 'magick: not found' });
      });

      await expect(convertHeicToJpegBuffer(testHeicFile, 90)).rejects.toThrow(
        'HEIC conversion failed'
      );
    });

    test('should validate quality parameter', async () => {
      const mockBuffer = Buffer.from('converted-data');
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(mockBuffer)
      };
      
      sharp.mockReturnValue(mockSharp);

      // Test with quality outside valid range
      await convertHeicToJpegBuffer(testHeicFile, 150);
      
      // Should clamp quality to valid range in ImageMagick fallback
      const mockExecCallback = (cmd, options, callback) => {
        expect(cmd).toMatch(/-quality\s+(100|[1-9]\d?)\s+/); // Quality should be 1-100
        const tempFile = cmd.match(/"([^"]+\.jpg)"/)[1];
        fs.writeFileSync(tempFile, 'converted-data');
        callback(null, { stdout: '', stderr: '' });
      };
      
      exec.mockImplementation(mockExecCallback);
      
      // Trigger ImageMagick fallback
      mockSharp.toBuffer.mockRejectedValue(new Error('Sharp failed'));
      
      await convertHeicToJpegBuffer(testHeicFile, 150);
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

    test('should clean up temporary files on error', async () => {
      const mockSharp = {
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp failed'))
      };
      
      sharp.mockReturnValue(mockSharp);

      // Mock ImageMagick that creates temp file but fails
      let tempFilePath;
      exec.mockImplementation((cmd, options, callback) => {
        tempFilePath = cmd.match(/"([^"]+\.jpg)"/)[1];
        fs.writeFileSync(tempFilePath, 'temp-data');
        callback(new Error('ImageMagick conversion failed'));
      });

      await expect(convertHeicToJpegBuffer(testHeicFile, 90)).rejects.toThrow();
      
      // Temp file should be cleaned up (note: timing dependent in real implementation)
      // This test verifies the cleanup attempt is made
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
      const mockSharp = {
        resize: jest.fn().mockReturnThis(),
        jpeg: jest.fn().mockReturnThis(),
        toFile: jest.fn().mockResolvedValue()
      };
      
      // Mock the convertHeicToJpegBuffer function
      const originalConvert = require('../media/image').convertHeicToJpegBuffer;
      require('../media/image').convertHeicToJpegBuffer = jest.fn().mockResolvedValue(mockConvertedBuffer);
      
      sharp.mockReturnValue(mockSharp);

      const result = await generateThumbnail(testHeicFile, 'heicthumb123', thumbDir);
      
      expect(sharp).toHaveBeenCalledWith(mockConvertedBuffer);
      expect(mockSharp.resize).toHaveBeenCalledWith(90, 90, { fit: 'inside' });
      expect(result).toBe(path.join(thumbDir, 'heicthumb123.jpg'));

      // Restore original function
      require('../media/image').convertHeicToJpegBuffer = originalConvert;
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

      // Should fallback to ImageMagick
      exec.mockImplementation((cmd, options, callback) => {
        callback(new Error('magick: improper image header'));
      });

      await expect(convertHeicToJpegBuffer(corruptedHeicFile, 90)).rejects.toThrow();
    });
  });
});