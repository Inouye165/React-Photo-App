/**
 * Thumbnail Component
 * 
 * Displays image thumbnails with intelligent caching for upload previews.
 * 
 * Features:
 * - IndexedDB caching for instant subsequent loads
 * - Unified HEIC/JPEG processing via generateClientThumbnail with memory-safe scaling
 * - Graceful degradation with styled placeholders for failed conversions
 * - Memory management with proper ObjectURL cleanup
 */

import React, { useEffect, useState, useRef } from 'react';
import { generateClientThumbnail } from '../utils/clientImageProcessing.js';
import { getThumbnail, saveThumbnail } from '../utils/thumbnailCache.js';

/**
 * HeicPlaceholder - A styled placeholder for HEIC files that couldn't be converted.
 * Shows a camera icon with HEIC badge to indicate the file type.
 */
const HeicPlaceholder = ({ filename, className }) => (
  <div 
    className={`flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600 ${className}`} 
    style={{ minHeight: '100px' }}
    title={`${filename} - Will be converted after upload`}
  >
    {/* Camera/Image icon */}
    <svg 
      className="w-10 h-10 mb-1 text-gray-400" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth="1.5" 
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" 
      />
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth="1.5" 
        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" 
      />
    </svg>
    {/* HEIC badge */}
    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
      HEIC
    </span>
  </div>
);

/**
 * GenericPlaceholder - Fallback placeholder for unsupported/errored images.
 */
const GenericPlaceholder = ({ filename, className }) => {
  const extension = filename?.split('.').pop()?.toUpperCase() || 'IMG';
  
  return (
    <div 
      className={`flex flex-col items-center justify-center bg-gray-200 text-gray-600 font-bold text-sm ${className}`} 
      style={{ minHeight: '100px' }}
    >
      <svg 
        className="w-10 h-10 mb-2 text-gray-400" 
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
      <span>{extension}</span>
    </div>
  );
};

/**
 * Thumbnail - Main component for displaying cached/generated thumbnails.
 * 
 * Processing pipeline:
 * 1. Check IndexedDB cache for existing thumbnail
 * 2. If not cached, generate thumbnail using generateClientThumbnail
 * 3. For HEIC files, fall back to heic-to if standard processing fails
 * 4. Cache successful results for future instant access
 * 5. Display appropriate placeholder on failure
 * 
 * @param {Object} props
 * @param {File} props.file - The image file to thumbnail
 * @param {string} props.className - CSS classes for styling
 */
const Thumbnail = ({ file, className = '' }) => {
  const [src, setSrc] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHeicFallback, setIsHeicFallback] = useState(false);
  
  // Track current ObjectURL for cleanup
  const objectUrlRef = useRef(null);
  
  // Track if component is mounted to prevent state updates after unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!file) {
      setIsLoading(false);
      return;
    }

    // Reset state for new file
    setLoadError(false);
    setSrc(null);
    setIsHeicFallback(false);
    setIsLoading(true);

    // Cleanup previous ObjectURL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                   file.name.toLowerCase().endsWith('.heif');

    const processThumbnail = async () => {
      try {
        // Step 1: Check cache first
        const cachedBlob = await getThumbnail(file);
        
        if (cachedBlob) {
          // Cache hit! Use cached thumbnail
          if (!mountedRef.current) return;
          
          const url = URL.createObjectURL(cachedBlob);
          objectUrlRef.current = url;
          setSrc(url);
          setIsLoading(false);
          return;
        }

        // Step 2: Generate new thumbnail (handles both regular images and HEIC conversion)
        const thumbnailBlob = await generateClientThumbnail(file);

        if (!mountedRef.current) return;

        if (thumbnailBlob) {
          // Step 3: Cache the thumbnail for future use (fire and forget)
          saveThumbnail(file, thumbnailBlob).catch(() => {
            // Ignore cache save errors - app still works
          });

          // Display the thumbnail
          const url = URL.createObjectURL(thumbnailBlob);
          objectUrlRef.current = url;
          setSrc(url);
          setIsLoading(false);
        } else if (isHeic) {
          // HEIC file that couldn't be converted (out-of-memory or conversion failure)
          console.warn(`HEIC thumbnail generation failed for ${file.name}`);
          setIsHeicFallback(true);
          setIsLoading(false);
        } else {
          // Non-HEIC file that failed - try direct ObjectURL as last resort
          try {
            const url = URL.createObjectURL(file);
            objectUrlRef.current = url;
            setSrc(url);
          } catch (err) {
            console.warn('Failed to create ObjectURL for file:', err);
            setLoadError(true);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.warn(`Thumbnail processing failed for ${file.name}:`, err);
        
        if (!mountedRef.current) return;
        
        if (isHeic) {
          setIsHeicFallback(true);
        } else {
          // Last resort: try direct file URL
          try {
            const url = URL.createObjectURL(file);
            objectUrlRef.current = url;
            setSrc(url);
          } catch {
            setLoadError(true);
          }
        }
        setIsLoading(false);
      }
    };

    processThumbnail();

    // Cleanup function
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [file]);

  // Additional cleanup on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-200 text-gray-600 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="text-xs mt-2">Loading...</span>
      </div>
    );
  }

  // HEIC fallback placeholder
  if (isHeicFallback) {
    return <HeicPlaceholder filename={file?.name || 'Unknown'} className={className} />;
  }

  // Generic error placeholder
  if (!src || loadError) {
    return <GenericPlaceholder filename={file?.name || 'Unknown'} className={className} />;
  }

  // Success: render the thumbnail image
  return (
    <img 
      src={src} 
      alt={file?.name || ''} 
      className={`object-cover w-full h-full ${className}`}
      onError={() => {
        setLoadError(true);
      }}
    />
  );
};

export default Thumbnail;
export { HeicPlaceholder, GenericPlaceholder };
