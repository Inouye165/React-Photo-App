/**
 * useThumbnailQueue Hook
 * 
 * Production-ready thumbnail processing with optimized state batching.
 * 
 * Key Features:
 * - Concurrent processing with configurable parallelism (default: 4)
 * - State batching to prevent UI thrashing from rapid setState calls
 * - Progressive loading as thumbnails become ready
 * - Memory-safe Blob URL management with proper cleanup
 * 
 * Performance Strategy:
 * Instead of calling setState for every individual thumbnail completion,
 * we buffer updates and flush them to React state periodically (default: 200ms).
 * This dramatically reduces React reconciliation overhead when processing
 * many files in parallel.
 * 
 * This solves the "[Violation] 'message' handler took 268ms" issue by:
 * 1. Batching state updates instead of updating per-file
 * 2. Processing files concurrently (4 at a time by default)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { generateClientThumbnail } from '../utils/clientImageProcessing.js';
import { getThumbnail, saveThumbnail } from '../utils/thumbnailCache.js';

/**
 * Queue-based thumbnail processor with batched state updates
 * 
 * @param {File[]} files - Array of image files to process
 * @param {Object} options - Configuration options
 * @param {number} [options.concurrency=4] - Number of concurrent thumbnail operations
 * @param {number} [options.batchInterval=200] - Milliseconds between state flush cycles
 * @returns {Object} - Processing state and thumbnail URLs
 */
export function useThumbnailQueue(files, options = {}) {
  const {
    concurrency = 4,        // Increased from 2 for better throughput
    batchInterval = 200,    // Flush buffered updates every 200ms
  } = options;

  // Map of filename -> thumbnail blob URL
  const [thumbnails, setThumbnails] = useState(new Map());
  
  // Map of filename -> processing status
  const [status, setStatus] = useState(new Map());
  
  // Overall progress
  const [progress, setProgress] = useState({ completed: 0, total: 0, failed: 0 });
  
  // Queue management refs
  const queueRef = useRef([]);
  const processingRef = useRef(new Set());
  const mountedRef = useRef(true);
  const processedFilesRef = useRef(new Set()); // Track which files we've already processed
  const generatedUrlsRef = useRef(new Set());  // Track generated URLs for cleanup

  /**
   * Staging Buffer for Batched State Updates
   * 
   * Instead of calling setState immediately for each thumbnail completion,
   * we accumulate updates here and flush them periodically. This prevents
   * "state thrashing" where rapid setState calls cause excessive re-renders.
   * 
   * Structure:
   * - thumbnails: Map of fileName -> blobURL (new thumbnails to add)
   * - status: Map of fileName -> status (status changes to apply)
   * - completedDelta: Number of newly completed items since last flush
   * - failedDelta: Number of newly failed items since last flush
   */
  const pendingUpdatesRef = useRef({
    thumbnails: new Map(),
    status: new Map(),
    completedDelta: 0,
    failedDelta: 0,
  });

  /**
   * Cleanup Effect: Handle unmounting and Blob URL revocation
   * 
   * IMPORTANT: We capture ref.current values to local variables to satisfy
   * the exhaustive-deps lint rule. React refs are mutable, so accessing
   * ref.current inside cleanup could theoretically read a different value
   * than intended. By capturing to a local const, we ensure cleanup operates
   * on the correct Set instance.
   */
  useEffect(() => {
    mountedRef.current = true;
    
    // Capture Set instances locally for cleanup
    const trackedUrls = generatedUrlsRef.current;
    const pendingBuffer = pendingUpdatesRef.current;

    return () => {
      mountedRef.current = false;
      
      // Revoke ALL tracked URLs - both those already in state AND those still in buffer
      trackedUrls.forEach(url => {
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      trackedUrls.clear();

      // Also revoke any URLs still pending in the buffer (not yet flushed to state)
      pendingBuffer.thumbnails.forEach(url => {
        if (url?.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      pendingBuffer.thumbnails.clear();
      pendingBuffer.status.clear();
      pendingBuffer.completedDelta = 0;
      pendingBuffer.failedDelta = 0;
    };
  }, []);

  /**
   * Flush Loop Effect: Periodically batch-update React state
   * 
   * This is the core performance optimization. Instead of updating state
   * on every single thumbnail completion (which causes React reconciliation
   * per-update), we accumulate changes and flush them in batches.
   * 
   * The interval runs continuously and checks if there's pending data.
   * If so, it performs a single batched state update and clears the buffer.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      // Skip if component unmounted
      if (!mountedRef.current) return;

      const pending = pendingUpdatesRef.current;

      // Only flush if there's actually data to flush
      const hasThumbnailUpdates = pending.thumbnails.size > 0;
      const hasStatusUpdates = pending.status.size > 0;
      const hasProgressUpdates = pending.completedDelta > 0 || pending.failedDelta > 0;

      if (!hasThumbnailUpdates && !hasStatusUpdates && !hasProgressUpdates) {
        return; // Nothing to flush
      }

      // Batch update thumbnails
      if (hasThumbnailUpdates) {
        const thumbnailsToAdd = new Map(pending.thumbnails);
        pending.thumbnails.clear();
        
        setThumbnails(prev => {
          const next = new Map(prev);
          thumbnailsToAdd.forEach((url, fileName) => next.set(fileName, url));
          return next;
        });
      }

      // Batch update status
      if (hasStatusUpdates) {
        const statusToAdd = new Map(pending.status);
        pending.status.clear();
        
        setStatus(prev => {
          const next = new Map(prev);
          statusToAdd.forEach((s, fileName) => next.set(fileName, s));
          return next;
        });
      }

      // Batch update progress counters
      if (hasProgressUpdates) {
        const completedInc = pending.completedDelta;
        const failedInc = pending.failedDelta;
        pending.completedDelta = 0;
        pending.failedDelta = 0;
        
        setProgress(prev => ({
          ...prev,
          completed: prev.completed + completedInc,
          failed: prev.failed + failedInc,
        }));
      }
    }, batchInterval);

    return () => clearInterval(timer);
  }, [batchInterval]);

  /**
   * Process a single thumbnail file
   * 
   * IMPORTANT: This function writes to the pendingUpdatesRef buffer
   * instead of calling setState directly. The flush loop will batch
   * these updates periodically.
   * 
   * @param {File} file - The file to process
   * @returns {Promise<string|null>} - The blob URL or null on failure
   */
  const processThumbnail = useCallback(async (file) => {
    if (!mountedRef.current) return null;

    const fileName = file.name;
    const pending = pendingUpdatesRef.current;
    
    // Buffer status update: processing
    pending.status.set(fileName, 'processing');

    try {
      // Check cache first
      const cached = await getThumbnail(file);
      
      if (cached) {
        const url = URL.createObjectURL(cached);
        if (!mountedRef.current) {
          URL.revokeObjectURL(url);
          return null;
        }
        
        // Track URL for cleanup on unmount
        generatedUrlsRef.current.add(url);
        
        // Buffer successful result (will be flushed by the interval)
        pending.thumbnails.set(fileName, url);
        pending.status.set(fileName, 'success');
        pending.completedDelta += 1;
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
        
        // Track URL for cleanup on unmount
        generatedUrlsRef.current.add(url);
        
        // Buffer successful result
        pending.thumbnails.set(fileName, url);
        pending.status.set(fileName, 'success');
        pending.completedDelta += 1;
        return url;
      } else {
        // Thumbnail generation failed (will show placeholder)
        pending.status.set(fileName, 'failed');
        pending.failedDelta += 1;
        pending.completedDelta += 1; // Failed still counts toward completion
        return null;
      }

    } catch (error) {
      console.error(`Thumbnail processing failed for ${fileName}:`, error);
      if (!mountedRef.current) return null;
      
      // Buffer failure
      pending.status.set(fileName, 'failed');
      pending.failedDelta += 1;
      pending.completedDelta += 1; // Failed still counts toward completion
      return null;
    }
  }, []);

  /**
   * Process queue with concurrency control
   * 
   * Spawns up to `concurrency` parallel thumbnail operations.
   * Each completion triggers the next item in the queue.
   * 
   * NOTE: The artificial delay has been REMOVED. Previously there was
   * a `setTimeout(10ms)` here to "yield to UI thread", but this is no
   * longer needed because:
   * 1. State updates are now batched (no per-file setState thrashing)
   * 2. Browser's task scheduler handles yielding naturally
   */
  const processQueue = useCallback(async () => {
    while (queueRef.current.length > 0 && processingRef.current.size < concurrency) {
      if (!mountedRef.current) break;

      const file = queueRef.current.shift();
      if (!file) break;
      
      processingRef.current.add(file.name);

      // Process thumbnail (don't await - let it run in parallel up to concurrency limit)
      processThumbnail(file).then(() => {
        processingRef.current.delete(file.name);

        // Process next in queue (no artificial delay needed with batching)
        if (mountedRef.current) {
          processQueue();
        }
      });
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