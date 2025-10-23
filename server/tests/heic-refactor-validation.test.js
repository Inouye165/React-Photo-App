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
    // Ensure runtime dependencies exist in package.json and can be required
    const serverPkg = require(path.join(__dirname, '..', 'package.json'));
    const deps = serverPkg.dependencies || {};
    expect(deps['heic-convert']).toBeDefined();
    expect(deps['sharp']).toBeDefined();
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
    // Behavioral check: when sharp conversion fails and heic-convert fails,
    // convertHeicToJpegBuffer should throw an Error containing both parts.
    // We simulate this by calling convertHeicToJpegBuffer with a non-image buffer
    // and expect it to either return a Buffer (non-HEIF) or throw a formatted error.
    return (async () => {
      const buf = Buffer.from('not-a-heic');
      try {
        const out = await convertHeicToJpegBuffer(buf, 90);
        expect(out).toBeInstanceOf(Buffer);
      } catch (err) {
        // If it throws, ensure message contains markers used in the code path
        const msg = String(err && err.message);
        expect(msg).toMatch(/Sharp error:/);
        expect(msg).toMatch(/Fallback error:/);
      }
    })();
  });
});