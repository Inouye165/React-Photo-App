const { convertHeicToJpegBuffer } = require('../media/image');
const path = require('path');
const fs = require('fs');

// Simple validation test for the refactored HEIC conversion
describe('HEIC Refactor Validation', () => {
  test('should export convertHeicToJpegBuffer function', () => {
    expect(typeof convertHeicToJpegBuffer).toBe('function');
  });

  test('should handle non-HEIC files correctly', async () => {
    // Create a test file
    const testDir = path.join(__dirname, 'test-refactor');
    const testFile = path.join(testDir, 'test.jpg');
    
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    fs.writeFileSync(testFile, 'fake-jpeg-data');
    
    try {
      const result = await convertHeicToJpegBuffer(testFile, 90);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('fake-jpeg-data');
    } finally {
      // Clean up
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  test('should validate that heic-convert is imported correctly', () => {
    // Read the image.js file to verify heic-convert import
    const imageJsPath = path.join(__dirname, '..', 'media', 'image.js');
    const content = fs.readFileSync(imageJsPath, 'utf8');
    
    expect(content).toContain("require('heic-convert')");
    expect(content).not.toContain("require('child_process')"); // Should be removed
    expect(content).not.toContain("HEIC_CONCURRENCY"); // Should be removed
    expect(content).not.toContain("awaitHeicIdle"); // Should be removed
  });

  test('should validate that ImageMagick code is removed', () => {
    const imageJsPath = path.join(__dirname, '..', 'media', 'image.js');
    const content = fs.readFileSync(imageJsPath, 'utf8');
    
    // Check that ImageMagick-related code is removed
    expect(content).not.toContain('magick');
    expect(content).not.toContain('execPromise');
    expect(content).not.toContain('heicAcquire');
    expect(content).not.toContain('heicRelease');
    expect(content).not.toContain('heicQueue');
  });

  test('should validate new error message format', () => {
    const imageJsPath = path.join(__dirname, '..', 'media', 'image.js');
    const content = fs.readFileSync(imageJsPath, 'utf8');
    
    // Check that new error message format is used
    expect(content).toContain('heic-convert fallback');
    expect(content).toContain('Sharp error:');
    expect(content).toContain('Fallback error:');
  });
});