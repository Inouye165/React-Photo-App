import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../api.js';

/**
 * Custom hook to manage signed thumbnail URLs for photo rendering
 * 
 * This hook:
 * - Fetches signed URLs for thumbnails from the backend
 * - Caches URLs to minimize API calls
 * - Automatically refreshes URLs before they expire
 * - Handles errors gracefully with fallbacks
 * 
 * @param {Array} photos - Array of photo objects with id and thumbnail properties
 * @param {string} token - Authentication token for API requests
 * @returns {Object} - { signedUrls, loading, error, refresh }
 */
export default function useSignedThumbnails(photos, token) {
  const [signedUrls, setSignedUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Track which photos have been fetched to avoid duplicate requests
  const fetchedPhotoIds = useRef(new Set());
  
  // Track refresh timers to clean them up on unmount
  const refreshTimers = useRef({});

  /**
   * Fetch signed URL for a single photo
   */
  const fetchSignedUrl = useCallback(async (photoId) => {
    if (!token) {
      console.warn('[useSignedThumbnails] No token available, skipping fetch');
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/photos/${photoId}/thumbnail-url`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        // Handle client errors (4xx) gracefully - these are expected
        if (response.status >= 400 && response.status < 500) {
          // 404: Photo not found or thumbnail not available (expected for some photos)
          // 401/403: Auth issues (handled elsewhere)
          console.debug(`[useSignedThumbnails] Thumbnail not available for photo ${photoId}: ${response.status}`);
          return null;
        }
        
        // Log server errors (5xx) as errors since these are unexpected
        console.error(`[useSignedThumbnails] Server error fetching thumbnail URL for photo ${photoId}:`, response.status);
        return null;
      }

      const data = await response.json();
      
      if (!data.success || !data.url) {
        console.warn(`[useSignedThumbnails] Invalid response for photo ${photoId}:`, data);
        return null;
      }

      return {
        url: data.url,
        expiresAt: data.expiresAt
      };
    } catch (err) {
      // Network errors or other unexpected issues
      console.error(`[useSignedThumbnails] Error fetching thumbnail URL for photo ${photoId}:`, err.message);
      return null;
    }
  }, [token]);

  /**
   * Schedule a refresh for a URL before it expires
   * Refreshes 2 minutes before expiry to prevent 403 errors
   */
  const scheduleRefresh = useCallback((photoId, expiresAt) => {
    // Clear any existing timer for this photo
    if (refreshTimers.current[photoId]) {
      clearTimeout(refreshTimers.current[photoId]);
    }

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expiresAt - now;
    
    // Refresh 2 minutes (120 seconds) before expiry
    const refreshIn = Math.max(0, (timeUntilExpiry - 120) * 1000);

    if (refreshIn > 0) {
      refreshTimers.current[photoId] = setTimeout(async () => {
        const newSignedUrl = await fetchSignedUrl(photoId);
        if (newSignedUrl) {
          setSignedUrls(prev => ({
            ...prev,
            [photoId]: newSignedUrl
          }));
          scheduleRefresh(photoId, newSignedUrl.expiresAt);
        }
      }, refreshIn);
    }
  }, [fetchSignedUrl]);

  /**
   * Fetch signed URLs for all photos that need them
   */
  const fetchAllSignedUrls = useCallback(async () => {
    if (!photos || photos.length === 0) {
      return;
    }

    // Filter photos that have thumbnails and haven't been fetched yet
    const photosToFetch = photos.filter(photo => 
      photo.thumbnail && 
      photo.id && 
      !fetchedPhotoIds.current.has(photo.id) &&
      !signedUrls[photo.id]
    );

    if (photosToFetch.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch all signed URLs in parallel
      const results = await Promise.all(
        photosToFetch.map(async (photo) => {
          const signedUrl = await fetchSignedUrl(photo.id);
          return { photoId: photo.id, signedUrl };
        })
      );

      // Update state with fetched URLs
      const newUrls = {};
      results.forEach(({ photoId, signedUrl }) => {
        if (signedUrl) {
          newUrls[photoId] = signedUrl;
          fetchedPhotoIds.current.add(photoId);
          scheduleRefresh(photoId, signedUrl.expiresAt);
        }
      });

      setSignedUrls(prev => ({ ...prev, ...newUrls }));
    } catch (err) {
      // This should rarely happen as individual fetch errors are caught above
      console.error('[useSignedThumbnails] Unexpected error fetching signed URLs:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [photos, signedUrls, fetchSignedUrl, scheduleRefresh]);

  /**
   * Manual refresh function exposed to consumers
   */
  const refresh = useCallback(() => {
    fetchedPhotoIds.current.clear();
    setSignedUrls({});
    fetchAllSignedUrls();
  }, [fetchAllSignedUrls]);

  /**
   * Fetch signed URLs when photos or token changes
   */
  useEffect(() => {
    if (token && photos && photos.length > 0) {
      fetchAllSignedUrls();
    }
  }, [photos, token, fetchAllSignedUrls]);

  /**
   * Clean up refresh timers on unmount
   */
  useEffect(() => {
    return () => {
      Object.values(refreshTimers.current).forEach(timer => clearTimeout(timer));
      refreshTimers.current = {};
    };
  }, []);

  /**
   * Helper function to get signed URL for a photo
   * Returns full URL with API base if signed URL is available,
   * otherwise returns original thumbnail path as fallback
   */
  const getSignedUrl = useCallback((photo) => {
    if (!photo || !photo.id || !photo.thumbnail) {
      return null;
    }

    const signed = signedUrls[photo.id];
    if (signed && signed.url) {
      // Return full URL with API base
      return `${API_BASE_URL}${signed.url}`;
    }

    // Fallback to original thumbnail path (will use cookie auth)
    return `${API_BASE_URL}${photo.thumbnail}`;
  }, [signedUrls]);

  return {
    signedUrls,
    loading,
    error,
    refresh,
    getSignedUrl
  };
}
