/**
 * Client Image Processing Utility
 * 
 * Handles client-side image operations including:
 * - Thumbnail generation with memory-safe processing
 * - Upload compression (resize to max 2048px, JPEG 85%)
 * - HEIC to JPEG conversion
 * 
 * @security Input validation on all file operations
 * @security Memory bounds checking to prevent DoS via large images
 * @security No metadata leakage in error logs (file names only, no content)
 */

// ==================== Type Definitions ====================

/**
 * HEIC converter function type from heic2any library
 */
type Heic2anyConverter = (options: {
  blob: Blob | File;
  toType: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

/**
 * HEIC converter function type from heic-to library
 */
type HeicToConverter = (options: {
  blob: Blob | File;
  type: string;
  quality?: number;
}) => Promise<Blob>;

/**
 * Scaled dimensions result
 */
interface ScaledDimensions {
  width: number;
  height: number;
}

/**
 * Compression result with metadata
 */
export interface CompressionResult {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: string;
  wasResized: boolean;
}

/**
 * Progress callback for batch operations
 */
export type ProgressCallback = (data: {
  index: number;
  total: number;
  file: File;
  result?: CompressionResult;
  error?: Error;
}) => void;

/**
 * Simple progress callback for thumbnail batch
 */
export type ThumbnailProgressCallback = (
  index: number,
  total: number,
  file: File,
  error?: Error
) => void;

/**
 * Compression options
 */
export interface CompressionOptions {
  maxSize?: number;
  quality?: number;
  onProgress?: ProgressCallback;
}

// ==================== Module-level State ====================

let heic2anyLoader: Promise<Heic2anyConverter> | undefined;
let heicToLoader: Promise<HeicToConverter> | undefined;

// ==================== Constants ====================

// Safe limits to prevent memory exhaustion
const MAX_THUMBNAIL_SIZE = 400; // Maximum dimension for thumbnails
const MAX_IMAGEDATA_SIZE = 2000; // Safety limit before ImageData creation
const MAX_UPLOAD_SIZE = 2048; // Maximum dimension for upload compression
const UPLOAD_JPEG_QUALITY = 0.85; // 85% JPEG quality for uploads

// ==================== Private Helper Functions ====================

/**
 * Dynamically load heic2any converter
 * @security SSR-safe: returns error-throwing function in non-browser environments
 */
async function loadHeic2any(): Promise<Heic2anyConverter> {
  if (typeof window === 'undefined') {
    return async () => {
      throw new Error('heic2any is only supported in browser environments');
    };
  }
  if (!heic2anyLoader) {
    heic2anyLoader = import('heic2any').then((module) => {
      const converter = (module as any)?.default ?? module;
      if (typeof converter !== 'function') {
        throw new Error('heic2any module did not export a function');
      }
      return converter as Heic2anyConverter;
    });
  }
  return heic2anyLoader;
}

/**
 * Dynamically load heic-to converter
 * @security SSR-safe: returns error-throwing function in non-browser environments
 */
async function loadHeicTo(): Promise<HeicToConverter> {
  if (typeof window === 'undefined') {
    return async () => {
      throw new Error('heic-to is only supported in browser environments');
    };
  }
  if (!heicToLoader) {
    heicToLoader = import('heic-to').then((module) => {
      const converter = (module as any)?.heicTo ?? (module as any)?.default ?? module;
      if (typeof converter !== 'function') {
        throw new Error('heic-to module did not export a function');
      }
      return converter as HeicToConverter;
    });
  }
  return heicToLoader;
}

/**
 * Check if file is HEIC format by name or MIME type
 * @security Input validation: safely handles null/undefined
 */
function isHeicFile(file: File | Blob | null | undefined): boolean {
  if (!file) return false;
  
  // Check if this is a File (has name property) or just a Blob
  const name = (file as File).name?.toLowerCase() || '';
  const type = file.type?.toLowerCase() || '';
  
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    type === 'image/heic' ||
    type === 'image/heif'
  );
}

/**
 * Load an image from a Blob/File using createImageBitmap or Image element
 * @security Validates blob before loading, timeout prevents hanging
 * @param blob - The blob to load
 * @returns Promise resolving to loaded image or bitmap
 */
async function loadImage(blob: Blob): Promise<HTMLImageElement | ImageBitmap> {
  // Validate blob first
  if (!blob || blob.size === 0) {
    throw new Error(`Invalid blob: size=${blob?.size}, type=${blob?.type}`);
  }

  // Try createImageBitmap first - more reliable for blobs
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return bitmap;
    } catch (bitmapError) {
      console.warn(
        `[loadImage] createImageBitmap failed, falling back to Image element:`,
        (bitmapError as Error).message
      );
    }
  }

  // Fallback to Image element
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load timeout'));
    }, 30000);

    img.onload = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      console.warn(`[loadImage] Image element failed: type=${blob.type}, size=${blob.size}`);
      reject(new Error('Failed to decode image'));
    };

    img.src = url;
  });
}

/**
 * Generate a thumbnail from an image with memory-safe scaling
 * @security Memory bounds: prevents OOM by scaling down before ImageData creation
 * @param img - Source image (HTMLImageElement or ImageBitmap)
 * @param maxSize - Maximum dimension for thumbnail
 * @returns Promise resolving to thumbnail blob
 */
async function createScaledThumbnail(
  img: HTMLImageElement | ImageBitmap,
  maxSize: number = MAX_THUMBNAIL_SIZE
): Promise<Blob> {
  // Step 1: Calculate safe dimensions
  let { width, height } = calculateScaledDimensions(img.width, img.height, maxSize);

  // Safety check: check that dimensions are reasonable
  if (width > MAX_IMAGEDATA_SIZE || height > MAX_IMAGEDATA_SIZE) {
    console.warn(`Image too large (${img.width}x${img.height}), scaling to safe size first`);
    const safeSize = calculateScaledDimensions(width, height, MAX_IMAGEDATA_SIZE);
    width = safeSize.width;
    height = safeSize.height;
  }

  // Step 2: Create canvas with safe dimensions
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', {
    alpha: false, // No transparency needed for thumbnails
    willReadFrequently: false,
  });

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Step 3: Configure high-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Step 4: Draw scaled image
  try {
    ctx.drawImage(img, 0, 0, width, height);
  } catch (drawError) {
    // If drawing fails, try with even smaller dimensions
    console.warn('Draw failed, retrying with smaller dimensions:', drawError);
    const halfSize = calculateScaledDimensions(width, height, Math.floor(maxSize / 2));
    canvas.width = halfSize.width;
    canvas.height = halfSize.height;
    ctx.drawImage(img, 0, 0, halfSize.width, halfSize.height);
  }

  // Step 5: Convert to blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      'image/jpeg',
      0.85 // Good quality for thumbnails
    );
  });

  // Step 6: Cleanup canvas to release memory
  canvas.width = 0;
  canvas.height = 0;

  return blob;
}

/**
 * Convert HEIC to JPEG using multiple fallback strategies
 * @security Error handling: tries multiple converters, sanitizes error messages
 * @param file - The HEIC file to convert
 * @returns Promise resolving to JPEG blob
 * @throws Error if all conversion methods fail
 */
async function convertHeicToJpeg(file: Blob | File): Promise<Blob> {
  // Strategy 1: Try heic2any (uses libheif, handles most HEIC files)
  try {
    const heic2any = await loadHeic2any();
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.8,
    });
    // heic2any can return array or single blob
    return Array.isArray(result) ? result[0] : result;
  } catch (heic2anyError) {
    // Check if it's a format not supported error
    const error = heic2anyError as any;
    const isFormatError =
      error?.code === 2 ||
      error?.message?.includes('format not supported') ||
      error?.message?.includes('ERR_LIBHEIF');

    if (!isFormatError) {
      // If it's a different error, rethrow
      throw heic2anyError;
    }

    const fileName = (file as File).name || 'unknown';
    console.warn(`heic2any failed for ${fileName}, trying heic-to fallback:`, error.message);
  }

  // Strategy 2: Try heic-to as fallback (different decoder implementation)
  try {
    const heicTo = await loadHeicTo();
    const result = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.8,
    });
    return result;
  } catch (heicToError) {
    const fileName = (file as File).name || 'unknown';
    console.warn(`heic-to also failed for ${fileName}:`, (heicToError as Error).message || heicToError);
    // Throw a combined error message
    throw new Error(`All HEIC converters failed for ${fileName}`);
  }
}

// ==================== Public API Functions ====================

/**
 * Calculate scaled dimensions that fit within max bounds while preserving aspect ratio
 * @param width - Original width
 * @param height - Original height
 * @param maxSize - Maximum dimension for either side
 * @returns Scaled dimensions
 */
export function calculateScaledDimensions(
  width: number,
  height: number,
  maxSize: number
): ScaledDimensions {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const scale = Math.min(maxSize / width, maxSize / height);
  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale),
  };
}

/**
 * Check if the file type is supported for client-side processing
 * (non-HEIC types that browsers can natively handle)
 * @security Input validation: safely handles null/undefined
 * @param file - The file to check
 * @returns True if supported natively, false otherwise
 */
export function isSupportedImageType(file: File | null | undefined): boolean {
  if (!file) return false;

  // Check MIME type first
  if (file.type) {
    const supportedTypes = new Set([
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/bmp',
    ]);
    if (supportedTypes.has(file.type.toLowerCase())) {
      return true;
    }
  }

  // Fallback: check file extension (some browsers don't set type for folder picker)
  if (file.name) {
    const ext = file.name.toLowerCase().split('.').pop();
    const supportedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);
    if (ext && supportedExtensions.has(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a client-side thumbnail from an image file
 * 
 * Main entry point for thumbnail generation. Handles both regular images
 * and HEIC files with memory-safe processing.
 * 
 * @security Input validation, memory bounds checking, graceful error handling
 * @security No metadata leakage: only logs file names, not content
 * 
 * @param file - Image file to process
 * @param maxSize - Maximum thumbnail dimension (default: 400px)
 * @returns Promise resolving to thumbnail blob, or null on failure
 */
export async function generateClientThumbnail(
  file: File | null | undefined,
  maxSize: number = MAX_THUMBNAIL_SIZE
): Promise<Blob | null> {
  if (!file) {
    return null;
  }

  try {
    let sourceBlob: Blob = file;
    let isHeic = isHeicFile(file);

    // If not identified as HEIC by name/type, check content for magic numbers
    // This handles HEIC files incorrectly named as .JPG (common with iOS exports)
    if (!isHeic) {
      if (isSupportedImageType(file)) {
        try {
          // Read into a fresh buffer to check magic numbers
          const arrayBuffer = await file.arrayBuffer();
          const arr = new Uint8Array(arrayBuffer).subarray(0, 12);

          // Check for HEIC signature: 'ftyp' at offset 4
          if (arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70) {
            const brand = String.fromCharCode(...arr.subarray(8, 12));
            const heicBrands = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

            if (heicBrands.includes(brand)) {
              console.warn(`File ${file.name} has incorrect extension but appears to be HEIC. Converting...`);
              isHeic = true;
              sourceBlob = new Blob([arrayBuffer], { type: 'image/heic' });
            }
          }

          if (!isHeic) {
            // It's likely a real JPEG or other supported type
            sourceBlob = new Blob([arrayBuffer], { type: file.type || 'image/jpeg' });
          }
        } catch (readError) {
          console.warn(`Failed to read file ${file.name}:`, readError);
          return null;
        }
      } else {
        // Unsupported type and not HEIC
        return null;
      }
    }

    if (isHeic) {
      try {
        sourceBlob = await convertHeicToJpeg(sourceBlob);
      } catch (heicError) {
        console.warn(`HEIC conversion failed for ${file.name}:`, heicError);
        // Return null to trigger fallback in Thumbnail component
        return null;
      }
    }

    // Load the image
    const img = await loadImage(sourceBlob);

    // Check if image is suspiciously large (potential DoS)
    if (img.width * img.height > 50000000) {
      // ~50 megapixels
      console.warn(`Very large image detected: ${img.width}x${img.height} (${file.name})`);
    }

    // Generate thumbnail with memory-safe scaling
    const thumbnailBlob = await createScaledThumbnail(img, maxSize);

    return thumbnailBlob;
  } catch (error) {
    console.error(`generateClientThumbnail failed for ${file.name}:`, error);
    // Return null to trigger fallback behavior in Thumbnail component
    return null;
  }
}

/**
 * Batch process multiple files with rate limiting to avoid memory spikes
 * @param files - Files to process
 * @param onProgress - Progress callback (index, total, file, error?)
 * @param maxSize - Maximum thumbnail dimension
 * @returns Promise resolving to Map of filename to thumbnail blob
 */
export async function generateClientThumbnailBatch(
  files: File[],
  onProgress: ThumbnailProgressCallback | null = null,
  maxSize: number = MAX_THUMBNAIL_SIZE
): Promise<Map<string, Blob>> {
  const results = new Map<string, Blob>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const thumbnail = await generateClientThumbnail(file, maxSize);

      if (thumbnail) {
        results.set(file.name, thumbnail);
      }

      if (onProgress) {
        onProgress(i + 1, files.length, file);
      }

      // Yield to event loop between files to prevent UI blocking
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch (error) {
      console.error(`Batch processing failed for ${file.name}:`, error);

      if (onProgress) {
        onProgress(i + 1, files.length, file, error as Error);
      }
    }
  }

  return results;
}

/**
 * Compress an image for upload to reduce transfer size and upload time
 * 
 * Designed to run BEFORE uploading to the server:
 * - Resizes images larger than 2048px (width or height)
 * - Converts to JPEG at 85% quality
 * - Handles HEIC files automatically
 * - Preserves aspect ratio
 * 
 * @security Memory bounds checking, input validation
 * @security No metadata leakage in logs
 * 
 * @param file - Image file to compress
 * @param options - Compression options (maxSize, quality)
 * @returns Promise resolving to compression result with metadata
 */
export async function compressForUpload(
  file: File,
  options: Omit<CompressionOptions, 'onProgress'> = {}
): Promise<CompressionResult> {
  const { maxSize = MAX_UPLOAD_SIZE, quality = UPLOAD_JPEG_QUALITY } = options;

  if (!file) {
    throw new Error('No file provided for compression');
  }

  const originalSize = file.size;
  let sourceBlob: Blob = file;
  let isHeic = isHeicFile(file);

  // Check for misnamed HEIC files (common with iOS)
  if (!isHeic && isSupportedImageType(file)) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const arr = new Uint8Array(arrayBuffer).subarray(0, 12);

      if (arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70) {
        const brand = String.fromCharCode(...arr.subarray(8, 12));
        const heicBrands = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

        if (heicBrands.includes(brand)) {
          isHeic = true;
          sourceBlob = new Blob([arrayBuffer], { type: 'image/heic' });
        }
      }

      if (!isHeic) {
        sourceBlob = new Blob([arrayBuffer], { type: file.type || 'image/jpeg' });
      }
    } catch {
      // Continue with original file
    }
  }

  // Convert HEIC to JPEG first
  if (isHeic) {
    sourceBlob = await convertHeicToJpeg(sourceBlob);
  }

  // Load image to get dimensions
  const img = await loadImage(sourceBlob);
  const originalWidth = img.width;
  const originalHeight = img.height;

  // Check if resizing is needed
  const needsResize = originalWidth > maxSize || originalHeight > maxSize;

  // Calculate new dimensions
  const { width, height } = needsResize
    ? calculateScaledDimensions(originalWidth, originalHeight, maxSize)
    : { width: originalWidth, height: originalHeight };

  // Create canvas and draw
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: false,
  });

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to JPEG blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      'image/jpeg',
      quality
    );
  });

  // Cleanup
  canvas.width = 0;
  canvas.height = 0;

  return {
    blob,
    width,
    height,
    originalSize,
    compressedSize: blob.size,
    compressionRatio: (originalSize / blob.size).toFixed(2),
    wasResized: needsResize,
  };
}

/**
 * Compress multiple files for upload with progress callback
 * @param files - Array of files to compress
 * @param options - Options including onProgress callback
 * @returns Promise resolving to Map of filename to compression result
 */
export async function compressFilesForUpload(
  files: File[],
  options: CompressionOptions = {}
): Promise<Map<string, CompressionResult>> {
  const { onProgress, maxSize, quality } = options;
  const results = new Map<string, CompressionResult>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const result = await compressForUpload(file, { maxSize, quality });
      results.set(file.name, result);

      if (onProgress) {
        onProgress({
          index: i + 1,
          total: files.length,
          file,
          result,
        });
      }

      // Yield to event loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch (error) {
      console.error(`Compression failed for ${file.name}:`, error);

      if (onProgress) {
        onProgress({
          index: i + 1,
          total: files.length,
          file,
          error: error as Error,
        });
      }
    }
  }

  return results;
}

// Default export for backwards compatibility
export default {
  generateClientThumbnail,
  generateClientThumbnailBatch,
  compressForUpload,
  compressFilesForUpload,
};
