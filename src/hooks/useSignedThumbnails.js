import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL, isCookieSessionActive } from '../api';

function isSignedThumbnailUrl(thumbnailUrl) {
  if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return false;
  // Only treat /display/thumbnails URLs with both sig and exp as signed.
  // This is a conservative check to avoid accidentally treating unrelated URLs as signed.
  return (
    thumbnailUrl.includes('/display/thumbnails/') &&
    thumbnailUrl.includes('sig=') &&
    thumbnailUrl.includes('exp=')
  );
}

/**
 * Custom hook to manage signed thumbnail URLs for photo rendering
 * 
 * This hook:
 * - Fetches signed URLs for thumbnails from the backend
 * - Caches URLs to minimize API calls
 * - Automatically refreshes URLs before they expire
 * - Handles errors gracefully with fallbacks
 * - Tracks photos without thumbnails to avoid re-fetching
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
  
  // Track photos that have no thumbnail (hasThumbnail: false)
  const noThumbnailPhotoIds = useRef(new Set());
  
  // Track refresh timers to clean them up on unmount
  const refreshTimers = useRef({});

  /**
   * Fetch signed URL for a single photo
   */
  const fetchSignedUrl = useCallback(async (photoId) => {
    // In cookie-session mode, we can fetch without attaching Authorization.
    // If neither cookie-session nor a token is available, user is not logged in.
    if (!token && !isCookieSessionActive()) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/photos/${photoId}/thumbnail-url`, {
        headers: isCookieSessionActive() ? undefined : ({
          'Authorization': `Bearer ${token}`
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        // 404 means photo not found or unauthorized - expected after session loss or deletion
        if (response.status === 404) {
          // Track this photo to avoid re-fetching
          noThumbnailPhotoIds.current.add(photoId);
          // Debug level only - this is expected when photos are deleted or user session changes
          if (import.meta.env?.DEV) {
            console.debug(`[useSignedThumbnails] Photo ${photoId} not found or unauthorized (404)`);
          }
          return null;
        }
        
        // Other 4xx errors (401/403 auth issues handled elsewhere)
        if (response.status >= 400 && response.status < 500) {
          console.debug(`[useSignedThumbnails] Client error for photo ${photoId}: ${response.status}`);
          return null;
        }
        
        // Log server errors (5xx) as errors since these are unexpected
        console.error(`[useSignedThumbnails] Server error fetching thumbnail URL for photo ${photoId}:`, response.status);
        return null;
      }

      const data = await response.json();
      
      // Check if response indicates no thumbnail available
      if (data.hasThumbnail === false) {
        // Normal case: photo exists but has no thumbnail yet
        // Track this photo to avoid re-fetching
        noThumbnailPhotoIds.current.add(photoId);
        return null;
      }
      
      if (!data.success || !data.url) {
        console.warn(`[useSignedThumbnails] Invalid response for photo ${photoId}:`, data);
        return null;
      }

      // Photo has a thumbnail - remove from no-thumbnail set if present
      noThumbnailPhotoIds.current.delete(photoId);

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
    // Skip entirely if no token (user not logged in)
    if (!token) {
      return;
    }

    if (!photos || photos.length === 0) {
      return;
    }

    // Filter photos that:
    // - Have thumbnail property
    // - Have an id
    // - Haven't been fetched yet
    // - Don't already have a signed URL
    // - Don't already have a signed thumbnail URL from /photos
    // - Are not marked as having no thumbnail
    const photosToFetch = photos.filter(photo => 
      photo.thumbnail && 
      photo.id && 
      !fetchedPhotoIds.current.has(photo.id) &&
      !signedUrls[photo.id] &&
      !isSignedThumbnailUrl(photo.thumbnail) &&
      !noThumbnailPhotoIds.current.has(photo.id)
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

      // Only update state if we actually have new URLs to avoid infinite loops
      if (Object.keys(newUrls).length > 0) {
        setSignedUrls(prev => ({ ...prev, ...newUrls }));
      }
    } catch (err) {
      // This should rarely happen as individual fetch errors are caught above
      console.error('[useSignedThumbnails] Unexpected error fetching signed URLs:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [photos, token, signedUrls, fetchSignedUrl, scheduleRefresh]);

  /**
   * Manual refresh function exposed to consumers
   */
  const refresh = useCallback(() => {
    fetchedPhotoIds.current.clear();
    noThumbnailPhotoIds.current.clear();
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
   * otherwise returns null to indicate the URL requires authenticated fetch
   * 
   * IMPORTANT: After Bearer token migration, fallback URLs that previously
   * relied on cookie auth now return null. Components should use
   * AuthenticatedImage component or fetchProtectedBlobUrl for these cases.
   * 
   * @param {Object} photo - Photo object with id, thumbnail, and url properties
   * @param {string} type - 'thumbnail' (default) or 'full' for full-size image
   * @returns {string|null} - Signed URL, absolute URL, data URI, or null if auth required
   */
  const getSignedUrl = useCallback((photo, type = 'thumbnail') => {
    if (!photo || !photo.id) {
      return null;
    }

    // For full-size images, check if URL is already public/absolute
    if (type === 'full' && photo.url) {
      // If URL is already absolute (external) or a data URI, return as is
      if (photo.url.startsWith('http') || photo.url.startsWith('data:')) {
        return photo.url;
      }
      // Server-relative URLs require auth - return null to signal need for AuthenticatedImage
      // The component should use fetchProtectedBlobUrl for these
      return null;
    }

    // For thumbnails, require the thumbnail property
    if (!photo.thumbnail) {
      return null;
    }

    // If /photos already provided a signed thumbnail URL, use it directly.
    if (type === 'thumbnail' && isSignedThumbnailUrl(photo.thumbnail)) {
      return `${API_BASE_URL}${photo.thumbnail}`;
    }

    const signed = signedUrls[photo.id];
    if (signed && signed.url) {
      // Return full URL with API base - signed URLs don't need additional auth
      return `${API_BASE_URL}${signed.url}`;
    }

    // No signed URL available yet - return null to signal need for authenticated fetch
    // Components should either wait for signed URL or use AuthenticatedImage
    return null;
  }, [signedUrls]);

  return {
    signedUrls,
    loading,
    error,
    refresh,
    getSignedUrl
  };
}
