/**
 * AuthenticatedImage Component
 * 
 * Renders images that require Bearer token authentication.
 * Uses fetchProtectedBlobUrl to fetch images with proper auth headers,
 * then displays them using a blob URL.
 * 
 * This component is essential for the Bearer token auth migration since
 * standard <img src="..."> tags cannot send Authorization headers.
 * 
 * Features:
 * - Automatic Bearer token authentication via fetchProtectedBlobUrl
 * - Loading state with customizable placeholder
 * - Error handling with fallback display
 * - Proper memory cleanup (revokes blob URLs on unmount)
 * - Supports all standard img attributes
 */

import React, { useState, useEffect, useRef } from 'react';
import { fetchProtectedBlobUrl, revokeBlobUrl } from '../api';

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  className?: string;
  loadingPlaceholder?: React.ReactNode;
  errorPlaceholder?: React.ReactNode;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event> | Error) => void;
}

/**
 * AuthenticatedImage Component
 * 
 * Renders images that require Bearer token authentication.
 * Uses fetchProtectedBlobUrl to fetch images with proper auth headers,
 * then displays them using a blob URL.
 * 
 * This component is essential for the Bearer token auth migration since
 * standard <img src="..."> tags cannot send Authorization headers.
 * 
 * Features:
 * - Automatic Bearer token authentication via fetchProtectedBlobUrl
 * - Loading state with customizable placeholder
 * - Error handling with fallback display
 * - Proper memory cleanup (revokes blob URLs on unmount)
 * - Supports all standard img attributes
 */
const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({
  src,
  alt = '',
  className = '',
  loading = 'lazy',
  loadingPlaceholder,
  errorPlaceholder,
  onLoad,
  onError,
  ...imgProps
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const blobUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Skip if no src provided
    if (!src) {
      setStatus('idle');
      return;
    }

    // Skip if src is already a blob URL or data URI (no auth needed)
    if (src.startsWith('blob:') || src.startsWith('data:')) {
      setBlobUrl(src);
      setStatus('success');
      return;
    }

    // Start loading
    setStatus('loading');
    setBlobUrl(null);

    // Create abort controller for cleanup
    abortControllerRef.current = new AbortController();

    const loadImage = async () => {
      try {
        const url = await fetchProtectedBlobUrl(src, {
          signal: abortControllerRef.current?.signal
        });

        // Store ref for cleanup
        blobUrlRef.current = url;
        setBlobUrl(url);
        setStatus('success');
      } catch (err: any) {
        // Ignore abort errors (component unmounted or src changed)
        if (err.name === 'AbortError') {
          return;
        }
        
        console.error('[AuthenticatedImage] Failed to load image:', src, err.message);
        setStatus('error');
        onError?.(err);
      }
    };

    loadImage();

    // Cleanup function
    return () => {
      // Abort any pending fetch
      abortControllerRef.current?.abort();
      
      // Revoke previous blob URL to prevent memory leaks
      if (blobUrlRef.current) {
        revokeBlobUrl(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [src, onError]);

  // Handle successful image load
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    onLoad?.(e);
  };

  // Handle image element error (e.g., corrupted image data)
  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setStatus('error');
    onError?.(e);
  };

  // Loading state
  if (status === 'loading') {
    if (loadingPlaceholder) {
      return <>{loadingPlaceholder}</>;
    }
    return (
      <div 
        className={`flex items-center justify-center bg-gray-100 ${className}`}
        role="img"
        aria-label={`Loading ${alt}`}
      >
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    if (errorPlaceholder) {
      return <>{errorPlaceholder}</>;
    }
    return (
      <div 
        className={`flex items-center justify-center bg-gray-200 text-gray-500 ${className}`}
        role="img"
        aria-label={`Failed to load ${alt}`}
      >
        <svg 
          className="w-8 h-8" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth="1.5" 
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
          />
        </svg>
      </div>
    );
  }

  // Idle state (no src)
  if (!blobUrl) {
    return null;
  }

  // Success state - render the image
  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      onLoad={handleLoad}
      onError={handleError}
      loading={loading}
      {...imgProps}
    />
  );
};

export default AuthenticatedImage;
