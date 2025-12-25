const sharp = require('sharp');

describe('HEIC Conversion Tests (deterministic)', () => {
  // HEIC decoding and conversion can be slow/flaky across environments.
  // These tests intentionally avoid depending on a binary HEIC fixture file.
  jest.setTimeout(30000);

  describe('Fallback behavior (mocked)', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    test('falls back to heic-convert when sharp conversion fails', async () => {
      const heicConvertMock = jest.fn(async () => Buffer.from('FAKE_JPEG'));
      const sharpInstance = {
        metadata: jest.fn(async () => ({ format: 'heif' })),
        rotate: jest.fn(() => sharpInstance),
        jpeg: jest.fn(() => ({ toBuffer: jest.fn(async () => { throw new Error('sharp fail'); }) })),
      };
      const sharpMock = jest.fn(() => sharpInstance);
      sharpMock.concurrency = jest.fn();
      sharpMock.cache = jest.fn();

      jest.doMock('sharp', () => sharpMock);
      jest.doMock('heic-convert', () => heicConvertMock);
      jest.doMock('../lib/supabaseClient', () => ({ storage: { from: () => ({ list: jest.fn(), upload: jest.fn(), download: jest.fn() }) } }));

      const { _internal } = require('../media/image');
      const input = Buffer.from('FAKE_HEIC');

      const out = await _internal.convertHeicToJpegBufferInternal(input, 90);
      expect(Buffer.isBuffer(out)).toBe(true);
      expect(out.toString('utf8')).toBe('FAKE_JPEG');
      expect(heicConvertMock).toHaveBeenCalledWith(
        expect.objectContaining({ buffer: input, format: 'JPEG', quality: 0.9 })
      );
    });
  });

  describe('Non-HEIC file handling', () => {
    const { convertHeicToJpegBuffer } = require('../media/image');

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
    const { convertHeicToJpegBuffer } = require('../media/image');

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
