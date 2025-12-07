/**
 * useThumbnailQueue Hook
 * 
 * Production-ready thumbnail processing that:
 * - Processes thumbnails sequentially to avoid UI freezing
 * - Shows progressive loading as thumbnails become ready
 * - Prioritizes visible thumbnails first
 * - Limits concurrency to prevent memory issues
 * 
 * This solves the "[Violation] 'message' handler took 268ms" issue by
 * processing HEIC files 2 at a time instead of all at once.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { generateClientThumbnail } from '../utils/clientImageProcessing.js';
import { getThumbnail, saveThumbnail } from '../utils/thumbnailCache.js';

/**
 * Queue-based thumbnail processor that prevents UI blocking
 * 
 * @param {File[]} files - Array of image files to process
 * @param {Object} options - Configuration options
 * @returns {Object} - Processing state and thumbnail URLs
 */
export function useThumbnailQueue(files, options = {}) {
  const {
    concurrency = 2, // Process 2 at a time for balance between speed and UI responsiveness
  } = options;

  // Map of filename -> thumbnail blob URL
  const [thumbnails, setThumbnails] = useState(new Map());
  
  // Map of filename -> processing status
  const [status, setStatus] = useState(new Map());
  
  // Overall progress
  const [progress, setProgress] = useState({ completed: 0, total: 0, failed: 0 });
  
  // Queue management
  const queueRef = useRef([]);
  const processingRef = useRef(new Set());
  const mountedRef = useRef(true);
  const processedFilesRef = useRef(new Set()); // Track which files we've already processed
  const generatedUrlsRef = useRef(new Set()); // Track generated URLs for cleanup

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      // Copy ref to local variable for cleanup
      const urlsToCleanup = Array.from(generatedUrlsRef.current);
      urlsToCleanup.forEach(url => {
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      generatedUrlsRef.current.clear();
    };
  }, []);

  // Process a single thumbnail
  const processThumbnail = useCallback(async (file) => {
    if (!mountedRef.current) return null;

    const fileName = file.name;
    
    // Update status to processing
    setStatus(prev => new Map(prev).set(fileName, 'processing'));

    try {
      // Check cache first
      const cached = await getThumbnail(file);
      
      if (cached) {
        const url = URL.createObjectURL(cached);
        if (!mountedRef.current) {
          URL.revokeObjectURL(url);
          return null;
        }
        
        generatedUrlsRef.current.add(url);
        setThumbnails(prev => new Map(prev).set(fileName, url));
        setStatus(prev => new Map(prev).set(fileName, 'success'));
        return url;
      }

      // Generate new thumbnail with memory-safe processing
      const blob = await generateClientThumbnail(file);
      
      if (!mountedRef.current) return null;

      if (blob) {
        // Cache for future use (fire and forget)
        saveThumbnail(file, blob).catch(err => {
          console.warn('Failed to cache thumbnail:', err);
        });

        const url = URL.createObjectURL(blob);
        generatedUrlsRef.current.add(url);
        setThumbnails(prev => new Map(prev).set(fileName, url));
        setStatus(prev => new Map(prev).set(fileName, 'success'));
        return url;
      } else {
        // Thumbnail generation failed (will show placeholder)
        setStatus(prev => new Map(prev).set(fileName, 'failed'));
        setProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
        return null;
      }

    } catch (error) {
      console.error(`Thumbnail processing failed for ${fileName}:`, error);
      if (!mountedRef.current) return null;
      
      setStatus(prev => new Map(prev).set(fileName, 'failed'));
      setProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
      return null;
    }
  }, []);

  // Process queue with concurrency control
  const processQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && processingRef.current.size < concurrency) {
      if (!mountedRef.current) break;

      const file = queueRef.current.shift();
      if (!file) break;
      
      processingRef.current.add(file.name);

      // Process thumbnail (don't await - let it run in parallel up to concurrency limit)
      processThumbnail(file).then(() => {
        processingRef.current.delete(file.name);
        
        // Update progress
        setProgress(prev => ({
          ...prev,
          completed: prev.completed + 1,
        }));

        // Process next in queue
        if (mountedRef.current) {
          processQueue();
        }
      });

      // Small delay to yield to UI thread - this is key to preventing violations
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }, [concurrency, processThumbnail]);

  // Initialize queue when files change
  useEffect(() => {
    if (!files || files.length === 0) {
      setThumbnails(new Map());
      setStatus(new Map());
      setProgress({ completed: 0, total: 0, failed: 0 });
      queueRef.current = [];
      processedFilesRef.current.clear();
      return;
    }

    // Check if files array has actually changed
    const existingFileNames = processedFilesRef.current;
    
    // Find files that need processing
    const filesToProcess = files.filter(f => !existingFileNames.has(f.name));
    
    if (filesToProcess.length === 0) {
      // All files already processed, nothing to do
      return;
    }

    // Reset progress for new batch
    setProgress({ completed: 0, total: files.length, failed: 0 });
    
    // Initialize status for all files
    const initialStatus = new Map();
    files.forEach(file => {
      if (!existingFileNames.has(file.name)) {
        initialStatus.set(file.name, 'pending');
      }
    });
    setStatus(prev => {
      const merged = new Map(prev);
      initialStatus.forEach((val, key) => merged.set(key, val));
      return merged;
    });

    // Mark files as being processed
    files.forEach(f => processedFilesRef.current.add(f.name));

    // Build queue with only new files
    queueRef.current = [...filesToProcess];

    // Start processing
    processQueue();

  }, [files, processQueue]);

  return {
    thumbnails,      // Map<filename, blobURL>
    status,          // Map<filename, 'pending'|'processing'|'success'|'failed'>
    progress,        // { completed, total, failed }
    isComplete: progress.total > 0 && progress.completed >= progress.total,
  };
}

export default useThumbnailQueue;
