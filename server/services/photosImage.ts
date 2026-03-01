// @ts-nocheck

// photosImage.ts - Photo image processing utilities and services
/**
 * Service for photo image processing: format conversion, metadata extraction, hashing, etc.
 * Uses dependency injection for image libraries/utilities, if needed.
 */
module.exports = function createPhotosImage({ sharp, exifr, crypto }) {
  return {
    /**
     * Convert HEIC/HEIF buffer to JPEG buffer.
     * @param {Buffer} inputBuffer
     * @returns {Promise<Buffer>}
     */
    async convertHeicToJpeg(inputBuffer) {
      // Sharp handles conversion
      return await sharp(inputBuffer).jpeg({ quality: 90 }).toBuffer();
    },

    /**
     * Convert an image buffer to WebP while preserving embedded metadata.
     *
     * NOTE: This preserves metadata that sharp can carry through the pipeline.
     * Callers must extract/record EXIF from the original bytes separately if they
     * need a normalized metadata object for DB/UI.
     *
     * @param {Buffer} inputBuffer
     * @param {Object} [options]
     * @param {number} [options.quality=80]
     * @returns {Promise<Buffer>}
     */
    async convertToWebpWithMetadata(inputBuffer, options = {}) {
      const quality = Number.isFinite(options.quality) ? options.quality : 80;
      return await sharp(inputBuffer)
        .withMetadata()
        .webp({ quality })
        .toBuffer();
    },
    /**
     * Extract metadata (EXIF, GPS, etc.) from a buffer.
     * @param {Buffer} buffer
     * @returns {Promise<Object>} parsed metadata
     */
    async extractMetadata(buffer) {
      return await exifr.parse(buffer, {
        tiff: true, ifd0: true, exif: true, gps: true, xmp: true, icc: true, iptc: true
      }) || {};
    },
    /**
     * Compute hash for a photo buffer.
     * @param {Buffer} buffer
     * @param {string} [algo='sha256']
     * @returns {string} hash
     */
    computeHash(buffer, algo = 'sha256') {
      return crypto.createHash(algo).update(buffer).digest('hex');
    }
  };
};

