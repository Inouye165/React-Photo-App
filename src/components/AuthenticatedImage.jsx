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

/**
 * @param {Object} props
 * @param {string} props.src - The protected image URL (relative or absolute)
 * @param {string} props.alt - Alt text for the image
 * @param {string} [props.className] - CSS classes for the image
 * @param {React.ReactNode} [props.loadingPlaceholder] - Custom loading placeholder
 * @param {React.ReactNode} [props.errorPlaceholder] - Custom error placeholder
 * @param {Function} [props.onLoad] - Callback when image loads successfully
 * @param {Function} [props.onError] - Callback when image fails to load
 * @param {...any} props - Additional props passed to the img element
 */
const AuthenticatedImage = ({
  src,
  alt = '',
  className = '',
  loadingPlaceholder,
  errorPlaceholder,
  onLoad,
  onError,
  ...imgProps
}) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const blobUrlRef = useRef(null);
  const abortControllerRef = useRef(null);

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
          signal: abortControllerRef.current.signal
        });

        // Store ref for cleanup
        blobUrlRef.current = url;
        setBlobUrl(url);
        setStatus('success');
      } catch (err) {
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
  const handleLoad = (e) => {
    onLoad?.(e);
  };

  // Handle image element error (e.g., corrupted image data)
  const handleError = (e) => {
    setStatus('error');
    onError?.(e);
  };

  // Loading state
  if (status === 'loading') {
    if (loadingPlaceholder) {
      return loadingPlaceholder;
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
      return errorPlaceholder;
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
      {...imgProps}
    />
  );
};

export default AuthenticatedImage;
