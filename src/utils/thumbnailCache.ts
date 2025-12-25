/**
 * Thumbnail Cache Utility
 * 
 * Provides persistent caching of generated thumbnails using IndexedDB.
 * This allows instant loading of previously processed thumbnails even after page reload.
 * 
 * Uses idb-keyval for a lightweight, promise-based IndexedDB wrapper.
 */

import { get, set, del, createStore } from 'idb-keyval';

// Create a dedicated store for thumbnail cache to avoid conflicts
const thumbnailStore = createStore('thumbnail-cache-db', 'thumbnails');

/**
 * Generate a unique cache key for a file based on its identity.
 * The key incorporates name, last modified time, and size to ensure
 * cache invalidation when the file changes.
 * 
 * @param {File} file - The file to generate a key for
 * @returns {string} - A unique cache key
 */
export function generateCacheKey(file: File): string {
  if (!file || !file.name) {
    throw new Error('Invalid file: file and file.name are required');
  }
  return `${file.name}-${file.lastModified}-${file.size}`;
}

/**
 * Retrieve a cached thumbnail from IndexedDB.
 * 
 * @param {File} file - The file to look up
 * @returns {Promise<Blob|null>} - The cached thumbnail blob, or null if not found
 */
export async function getThumbnail(file: File): Promise<Blob | null> {
  try {
    const key = generateCacheKey(file);
    const cached = await get(key, thumbnailStore);
    
    // Validate that cached data is a Blob
    if (cached instanceof Blob) {
      return cached;
    }
    
    return null;
  } catch (error: any) {
    // IndexedDB may fail (private browsing, quota exceeded, etc.)
    // Gracefully return null so the app continues to work
    console.warn('thumbnailCache: getThumbnail failed:', error.message || error);
    return null;
  }
}

/**
 * Save a thumbnail to IndexedDB cache.
 * 
 * @param {File} file - The original file (used to generate the key)
 * @param {Blob} thumbnailBlob - The thumbnail blob to cache
 * @returns {Promise<boolean>} - True if saved successfully, false otherwise
 */
export async function saveThumbnail(file: File, thumbnailBlob: Blob): Promise<boolean> {
  try {
    if (!thumbnailBlob || !(thumbnailBlob instanceof Blob)) {
      return false;
    }
    
    const key = generateCacheKey(file);
    await set(key, thumbnailBlob, thumbnailStore);
    return true;
  } catch (error: any) {
    // IndexedDB may fail (quota exceeded, private browsing, etc.)
    // Log warning but don't throw - app should still work
    console.warn('thumbnailCache: saveThumbnail failed:', error.message || error);
    return false;
  }
}

/**
 * Remove a cached thumbnail from IndexedDB.
 * Useful for cache invalidation or cleanup.
 * 
 * @param {File} file - The file whose cache entry should be removed
 * @returns {Promise<boolean>} - True if removed successfully, false otherwise
 */
export async function removeThumbnail(file: File): Promise<boolean> {
  try {
    const key = generateCacheKey(file);
    await del(key, thumbnailStore);
    return true;
  } catch (error: any) {
    console.warn('thumbnailCache: removeThumbnail failed:', error.message || error);
    return false;
  }
}

/**
 * Check if a thumbnail exists in cache without retrieving it.
 * This is a lightweight check for cache existence.
 * 
 * @param {File} file - The file to check
 * @returns {Promise<boolean>} - True if cached, false otherwise
 */
export async function hasThumbnail(file: File): Promise<boolean> {
  try {
    const key = generateCacheKey(file);
    const cached = await get(key, thumbnailStore);
    return cached instanceof Blob;
  } catch {
    return false;
  }
}

export default {
  generateCacheKey,
  getThumbnail,
  saveThumbnail,
  removeThumbnail,
  hasThumbnail,
};
