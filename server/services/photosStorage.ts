// @ts-nocheck

// photosStorage.ts - Supabase Storage management for photos
/**
 * Service for all photo storage operations (Supabase Storage).
 * Uses dependency injection for storageClient (e.g., supabase.storage.from('photos')).
 */
module.exports = function createPhotosStorage({ storageClient /*, logger*/ }) {
  return {
    /**
     * Move a photo file from one path to another.
     * @param {string} fromPath
     * @param {string} toPath
     * @returns {Promise<Object>} result { error, data }
     */
    async movePhoto(fromPath, toPath) {
      return await storageClient.move(fromPath, toPath);
    },
    /**
     * Delete photo file(s) at the given path(s).
     * @param {Array<string>} paths
     * @returns {Promise<Object>} result { error, data }
     */
    async deletePhotos(paths) {
      return await storageClient.remove(paths);
    },
    /**
     * Upload a file or buffer to storage under a given path.
     * @param {string} toPath
     * @param {Buffer|ReadableStream} data
     * @param {Object} [options]
     * @returns {Promise<Object>} result { error, data }
     */
    async uploadPhoto(toPath, data, options = {}) {
      return await storageClient.upload(toPath, data, options);
    },
    /**
     * Download a photo file from storage.
     * @param {string} fromPath
     * @returns {Promise<Object>} result { error, data }
     */
    async downloadPhoto(fromPath) {
      return await storageClient.download(fromPath);
    },
  };
};

