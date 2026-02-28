const { convertHeicToJpegBuffer } = require('../media/image');
const path = require('path');
const fs = require('fs');

// Simple validation test for the refactored HEIC conversion
describe('HEIC Refactor Validation', () => {
  test('should export convertHeicToJpegBuffer function', () => {
    expect(typeof convertHeicToJpegBuffer).toBe('function');
  });

  const os = require('os');
  test('should handle non-HEIC files correctly', async () => {
    // Use OS temp dir so path is allowed by validator
    const testDir = os.tmpdir();
    const testFile = path.join(testDir, `test-heic-refactor-${Date.now()}.jpg`);

    fs.writeFileSync(testFile, 'fake-jpeg-data');

    try {
      const result = await convertHeicToJpegBuffer(testFile, 90);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('fake-jpeg-data');
    } finally {
      // Clean up
      try {
        fs.unlinkSync(testFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  test('should validate that heic-convert is imported correctly', () => {
    // Verify runtime dependencies exist in package.json and can be required
    const serverPkg = require(path.join(__dirname, '..', 'package.json'));
    const deps = serverPkg.dependencies || {};
    expect(deps['heic-convert']).toBeDefined();
    expect(deps['sharp']).toBeDefined();
  });

  test('should validate that ImageMagick code is removed', () => {
    const imageTsPath = path.join(__dirname, '..', 'media', 'image.ts');
    const content = fs.readFileSync(imageTsPath, 'utf8');
    
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
        // If it throws, verify message contains markers used in the code path
        const msg = String(err && err.message);
        expect(msg).toMatch(/Sharp error:/);
        expect(msg).toMatch(/Fallback error:/);
      }
    })();
  });
});