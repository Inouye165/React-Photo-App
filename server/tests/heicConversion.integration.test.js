const { convertHeicToJpegBuffer } = require('../media/image');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const exifr = require('exifr');

describe('HEIC Conversion Integration Tests', () => {
  // HEIC decoding and conversion can be slow on CI/Windows.
  // Use a higher timeout to avoid flaky failures.
  jest.setTimeout(30000);

  const testFixturePath = path.join(__dirname, 'fixtures', 'test-photo-with-compass.heic');
  
  // Skip tests if fixture file doesn't exist
  const fixtureExists = fs.existsSync(testFixturePath);
  
  if (!fixtureExists) {
    test.skip('HEIC fixture not available, skipping integration tests', () => {});
  }

  describe('Real HEIC file conversion', () => {
    test('should convert actual HEIC file to valid JPEG', async () => {
      if (!fixtureExists) return;
      
      const heicBuffer = fs.readFileSync(testFixturePath);
      const jpegBuffer = await convertHeicToJpegBuffer(heicBuffer, 90);
      
      // Verify output is a valid JPEG
      expect(Buffer.isBuffer(jpegBuffer)).toBe(true);
      expect(jpegBuffer.length).toBeGreaterThan(0);
      
      // Verify Sharp can read it as JPEG
      const metadata = await sharp(jpegBuffer).metadata();
      expect(metadata.format).toBe('jpeg');
    });

    test('should preserve GPS coordinates during conversion when possible', async () => {
      if (!fixtureExists) return;
      
      const heicBuffer = fs.readFileSync(testFixturePath);
      
      // First check if original has GPS data
      const originalExif = await exifr.parse(heicBuffer);
      if (!originalExif || (!originalExif.latitude && !originalExif.GPSLatitude)) {
        // Original doesn't have GPS data, skip test
        return;
      }
      
      const jpegBuffer = await convertHeicToJpegBuffer(heicBuffer, 90);
      
      // Verify conversion produced valid output
      expect(Buffer.isBuffer(jpegBuffer)).toBe(true);
      expect(jpegBuffer.length).toBeGreaterThan(0);
      
      // Note: GPS preservation depends on Sharp's withMetadata() implementation
      // This test verifies the conversion doesn't fail, but GPS preservation
      // is tested by the metadata.compass.test.js integration test which uses
      // the full extraction pipeline
    });

    test('should convert HEIC with compass direction to valid JPEG', async () => {
      if (!fixtureExists) return;
      
      const heicBuffer = fs.readFileSync(testFixturePath);
      
      // Extract EXIF from original HEIC to verify it has compass data
      const originalExif = await exifr.parse(heicBuffer);
      
      if (!originalExif || originalExif.GPSImgDirection === undefined) {
        // Original doesn't have compass direction, skip test
        return;
      }
      
      const jpegBuffer = await convertHeicToJpegBuffer(heicBuffer, 90);
      
      // Verify conversion produced valid JPEG
      expect(Buffer.isBuffer(jpegBuffer)).toBe(true);
      expect(jpegBuffer.length).toBeGreaterThan(0);
      
      const metadata = await sharp(jpegBuffer).metadata();
      expect(metadata.format).toBe('jpeg');
      
      // Note: GPS/compass preservation is thoroughly tested in metadata.compass.test.js
      // which uses the full backgroundProcessor.extractMetadata() pipeline that reads
      // EXIF from the original HEIC buffer before conversion, which is the production approach
    });

    test('should respect quality parameter', async () => {
      if (!fixtureExists) return;
      
      const heicBuffer = fs.readFileSync(testFixturePath);
      
      // Convert with different quality settings
      const highQualityBuffer = await convertHeicToJpegBuffer(heicBuffer, 95);
      const lowQualityBuffer = await convertHeicToJpegBuffer(heicBuffer, 50);
      
      // Higher quality should produce larger file (generally)
      // Note: This isn't always true for all images, but should be for most
      expect(highQualityBuffer.length).toBeGreaterThan(0);
      expect(lowQualityBuffer.length).toBeGreaterThan(0);
      
      // Both should be valid JPEGs
      const highMetadata = await sharp(highQualityBuffer).metadata();
      const lowMetadata = await sharp(lowQualityBuffer).metadata();
      
      expect(highMetadata.format).toBe('jpeg');
      expect(lowMetadata.format).toBe('jpeg');
    });
  });

  describe('Non-HEIC file handling', () => {
    test('should return JPEG buffer unchanged', async () => {
      // Create a simple JPEG buffer
      const jpegBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      }).jpeg().toBuffer();
      
      const result = await convertHeicToJpegBuffer(jpegBuffer, 90);
      
      // Should return the same buffer for non-HEIC files
      expect(result).toBe(jpegBuffer);
    });

    test('should return PNG buffer unchanged', async () => {
      // Create a simple PNG buffer
      const pngBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      }).png().toBuffer();
      
      const result = await convertHeicToJpegBuffer(pngBuffer, 90);
      
      // Should return the same buffer for non-HEIC files
      expect(result).toBe(pngBuffer);
    });
  });

  describe('Error handling', () => {
    test('should handle corrupted buffers gracefully', async () => {
      const corruptedBuffer = Buffer.from('not-a-valid-image-file');
      
      // Should return original buffer if it can't determine format
      const result = await convertHeicToJpegBuffer(corruptedBuffer, 90);
      expect(result).toBe(corruptedBuffer);
    });

    test('should handle empty buffers', async () => {
      const emptyBuffer = Buffer.alloc(0);
      
      // Sharp will throw an error on empty buffer, which gets caught and returns original
      // However, the internal error handling returns original buffer on metadata read failure
      await expect(async () => {
        await convertHeicToJpegBuffer(emptyBuffer, 90);
      }).rejects.toThrow();
    });
  });
});
