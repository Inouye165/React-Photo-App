import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '../api';

type PhotoId = string | number;

type PhotoForSignedThumbnails = {
  id: PhotoId;
  thumbnail?: string | null;
  thumbnailUrl?: string | null;
  smallThumbnailUrl?: string | null;
  url?: string | null;
  fullUrl?: string | null;
};

type SignedThumbnail = {
  url: string;
  expiresAt: number;
};

type SignedUrlsMap = Record<string, SignedThumbnail>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSignedThumbnailUrl(thumbnailUrl: unknown): thumbnailUrl is string {
  if (!thumbnailUrl || typeof thumbnailUrl !== 'string') return false;

  if (/^https?:\/\//i.test(thumbnailUrl)) return true;

  return (
    thumbnailUrl.includes('/display/thumbnails/') &&
    thumbnailUrl.includes('sig=') &&
    thumbnailUrl.includes('exp=')
  );
}

export default function useSignedThumbnails(
  photos: PhotoForSignedThumbnails[] | null | undefined,
  token: string | null | undefined
): {
  signedUrls: SignedUrlsMap;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  getSignedUrl: (photo: PhotoForSignedThumbnails | null | undefined, type?: 'thumbnail' | 'full') => string | null;
} {
  const [signedUrls, setSignedUrls] = useState<SignedUrlsMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedPhotoIds = useRef<Set<string>>(new Set());
  const noThumbnailPhotoIds = useRef<Set<string>>(new Set());
  const refreshTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchSignedUrl = useCallback(
    async (photoId: PhotoId): Promise<SignedThumbnail | null> => {
      if (!token) return null;
      const key = String(photoId);

      try {
        const response = await fetch(`${API_BASE_URL}/photos/${photoId}/thumbnail-url`, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          credentials: 'include'
        });

        if (!response.ok) {
          if (response.status === 404) {
            noThumbnailPhotoIds.current.add(key);
            if (import.meta.env?.DEV) {
              console.debug(
                `[useSignedThumbnails] Photo ${photoId} not found or unauthorized (404)`
              );
            }
            return null;
          }

          if (response.status >= 400 && response.status < 500) {
            console.debug(
              `[useSignedThumbnails] Client error for photo ${photoId}: ${response.status}`
            );
            return null;
          }

          console.error(
            `[useSignedThumbnails] Server error fetching thumbnail URL for photo ${photoId}:`,
            response.status
          );
          return null;
        }

        const data: unknown = await response.json();
        if (!isRecord(data)) return null;

        if (data.hasThumbnail === false) {
          noThumbnailPhotoIds.current.add(key);
          return null;
        }

        if (data.success !== true || typeof data.url !== 'string' || typeof data.expiresAt !== 'number') {
          console.warn(`[useSignedThumbnails] Invalid response for photo ${photoId}:`, data);
          return null;
        }

        noThumbnailPhotoIds.current.delete(key);

        return {
          url: data.url,
          expiresAt: data.expiresAt
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[useSignedThumbnails] Error fetching thumbnail URL for photo ${photoId}:`,
          message
        );
        return null;
      }
    },
    [token]
  );

  const scheduleRefresh = useCallback(
    (photoId: PhotoId, expiresAt: number) => {
      const key = String(photoId);

      if (refreshTimers.current[key]) {
        clearTimeout(refreshTimers.current[key]);
      }

      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt - now;
      const refreshIn = Math.max(0, (timeUntilExpiry - 120) * 1000);

      if (refreshIn > 0) {
        refreshTimers.current[key] = setTimeout(async () => {
          const newSignedUrl = await fetchSignedUrl(photoId);
          if (newSignedUrl) {
            setSignedUrls((prev) => ({
              ...prev,
              [key]: newSignedUrl
            }));
            scheduleRefresh(photoId, newSignedUrl.expiresAt);
          }
        }, refreshIn);
      }
    },
    [fetchSignedUrl]
  );

  const fetchAllSignedUrls = useCallback(async () => {
    if (!token) return;
    if (!photos || photos.length === 0) return;

    const photosToFetch = photos.filter((photo) => {
      const key = String(photo.id);
      const thumbUrl = photo.thumbnailUrl || photo.thumbnail || null;
      return (
        !!thumbUrl &&
        photo.id !== undefined &&
        !fetchedPhotoIds.current.has(key) &&
        !signedUrls[key] &&
        !isSignedThumbnailUrl(thumbUrl) &&
        !noThumbnailPhotoIds.current.has(key)
      );
    });

    if (photosToFetch.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        photosToFetch.map(async (photo) => {
          const signedUrl = await fetchSignedUrl(photo.id);
          return { photoId: photo.id, signedUrl };
        })
      );

      const newUrls: SignedUrlsMap = {};
      results.forEach(({ photoId, signedUrl }) => {
        if (signedUrl) {
          const key = String(photoId);
          newUrls[key] = signedUrl;
          fetchedPhotoIds.current.add(key);
          scheduleRefresh(photoId, signedUrl.expiresAt);
        }
      });

      if (Object.keys(newUrls).length > 0) {
        setSignedUrls((prev) => ({ ...prev, ...newUrls }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[useSignedThumbnails] Unexpected error fetching signed URLs:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [photos, token, signedUrls, fetchSignedUrl, scheduleRefresh]);

  const refresh = useCallback(() => {
    fetchedPhotoIds.current.clear();
    noThumbnailPhotoIds.current.clear();
    setSignedUrls({});
    void fetchAllSignedUrls();
  }, [fetchAllSignedUrls]);

  useEffect(() => {
    if (token && photos && photos.length > 0) {
      void fetchAllSignedUrls();
    }
  }, [photos, token, fetchAllSignedUrls]);

  useEffect(() => {
    return () => {
      Object.values(refreshTimers.current).forEach((timer) => clearTimeout(timer));
      refreshTimers.current = {};
    };
  }, []);

  const getSignedUrl = useCallback(
    (photo: PhotoForSignedThumbnails | null | undefined, type: 'thumbnail' | 'full' = 'thumbnail') => {
      if (!photo || photo.id === undefined || photo.id === null) {
        return null;
      }

      if (type === 'full') {
        const fullUrl = photo.fullUrl || photo.url;
        if (fullUrl && (fullUrl.startsWith('http') || fullUrl.startsWith('data:'))) {
          return fullUrl;
        }
        return null;
      }

      const thumbUrl = photo.thumbnailUrl || photo.thumbnail;
      if (!thumbUrl) {
        return null;
      }

      if (type === 'thumbnail' && isSignedThumbnailUrl(thumbUrl)) {
        if (thumbUrl.startsWith('http')) return thumbUrl;
        return `${API_BASE_URL}${thumbUrl}`;
      }

      const signed = signedUrls[String(photo.id)];
      if (signed?.url) {
        return `${API_BASE_URL}${signed.url}`;
      }

      return null;
    },
    [signedUrls]
  );

  return {
    signedUrls,
    loading,
    error,
    refresh,
    getSignedUrl
  };
}
