/**
 * Client Image Processing Utility
 * 
 * Handles client-side image operations including:
 * - Thumbnail generation with memory-safe processing
 * - Upload compression (resize to max 2048px, JPEG 85%)
 * - HEIC to JPEG conversion
 */

let heic2anyLoader;
let heicToLoader;

async function loadHeic2any() {
  if (typeof window === 'undefined') {
    return async () => {
      throw new Error('heic2any is only supported in browser environments');
    };
  }
  if (!heic2anyLoader) {
    heic2anyLoader = import('heic2any').then((module) => {
      const converter = module?.default ?? module;
      if (typeof converter !== 'function') {
        throw new Error('heic2any module did not export a function');
      }
      return converter;
    });
  }
  return heic2anyLoader;
}

async function loadHeicTo() {
  if (typeof window === 'undefined') {
    return async () => {
      throw new Error('heic-to is only supported in browser environments');
    };
  }
  if (!heicToLoader) {
    heicToLoader = import('heic-to').then((module) => {
      const converter = module?.heicTo ?? module?.default ?? module;
      if (typeof converter !== 'function') {
        throw new Error('heic-to module did not export a function');
      }
      return converter;
    });
  }
  return heicToLoader;
}

// Safe limits to prevent memory exhaustion
const MAX_THUMBNAIL_SIZE = 400; // Maximum dimension for thumbnails
const MAX_IMAGEDATA_SIZE = 2000; // Safety limit before ImageData creation
const MAX_UPLOAD_SIZE = 2048; // Maximum dimension for upload compression
const UPLOAD_JPEG_QUALITY = 0.85; // 85% JPEG quality for uploads

/**
 * Calculate scaled dimensions that fit within max bounds while preserving aspect ratio.
 * @param {number} width - Original width
 * @param {number} height - Original height
 * @param {number} maxSize - Maximum dimension for either side
 * @returns {{width: number, height: number}} - Scaled dimensions
 */
export function calculateScaledDimensions(width, height, maxSize) {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const scale = Math.min(maxSize / width, maxSize / height);
  return {
    width: Math.floor(width * scale),
    height: Math.floor(height * scale)
  };
}

/**
 * Check if the file type is supported for client-side thumbnail generation
  // Client image processing functions
 * (non-HEIC types that browsers can natively handle)
 * @param {File} file - The file to check
 * @returns {boolean} - True if supported natively, false otherwise
 */
export function isSupportedImageType(file) {
  if (!file) return false;
  
  // Calculate scaled dimensions to fit within max bounds
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
  // Convert HEIC to JPEG
    if (supportedTypes.has(file.type.toLowerCase())) {
      return true;
    }
  }
  
  // Fallback: check file extension (some browsers don't set type for folder picker)
  if (file.name) {
    const ext = file.name.toLowerCase().split('.').pop();
    const supportedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);
    if (supportedExtensions.has(ext)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Load an image from a Blob/File.
 * Uses createImageBitmap for more reliable blob decoding.
 * @param {Blob} blob - The blob to load
 * @returns {Promise<HTMLImageElement|ImageBitmap>} - The loaded image
 */
async function loadImage(blob) {
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
      console.warn(`[loadImage] createImageBitmap failed, falling back to Image element:`, bitmapError.message);
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
 * Generate a thumbnail from an image with memory-safe scaling.
 * 
 * CRITICAL: This function scales images DOWN before creating ImageData
 * to prevent "Out of memory" errors with high-resolution photos.
 * 
 * @param {HTMLImageElement} img - Source image
 * @param {number} maxSize - Maximum dimension for thumbnail
 * @returns {Promise<Blob>} - Thumbnail blob
 */
async function createScaledThumbnail(img, maxSize = MAX_THUMBNAIL_SIZE) {
  // Step 1: Calculate safe dimensions
  // For very large images, we need to scale in stages to avoid memory issues
  let { width, height } = calculateScaledDimensions(
    img.width,
    img.height,
    maxSize
  );

  // Safety check: ensure dimensions are reasonable
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
    willReadFrequently: false
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
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
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
 * Convert HEIC to JPEG using multiple fallback strategies.
 * 
 * Some HEIC files use codecs that heic2any doesn't support (ERR_LIBHEIF errors).
 * We try multiple conversion libraries to maximize compatibility.
 * 
 * @param {File} file - The HEIC file to convert
 * @returns {Promise<Blob>} - JPEG blob
 * @throws {Error} - If all conversion methods fail
 */
async function convertHeicToJpeg(file) {
  // Strategy 1: Try heic2any (uses libheif, handles most HEIC files)
  try {
    const heic2any = await loadHeic2any();
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.8
    });
    // heic2any can return array or single blob
    return Array.isArray(result) ? result[0] : result;
  } catch (heic2anyError) {
    // Check if it's a format not supported error
    const isFormatError = heic2anyError?.code === 2 || 
                          heic2anyError?.message?.includes('format not supported') ||
                          heic2anyError?.message?.includes('ERR_LIBHEIF');
    
    if (!isFormatError) {
      // If it's a different error, rethrow
      throw heic2anyError;
    }
    
    console.warn(`heic2any failed for ${file.name}, trying heic-to fallback:`, heic2anyError.message);
  }

  // Strategy 2: Try heic-to as fallback (different decoder implementation)
  try {
    const heicTo = await loadHeicTo();
    const result = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.8
    });
    return result;
  } catch (heicToError) {
    console.warn(`heic-to also failed for ${file.name}:`, heicToError.message || heicToError);
    // Throw a combined error message
    throw new Error(`All HEIC converters failed for ${file.name}`);
  }
}

/**
 * Check if file is HEIC format
 * @param {File} file - The file to check
 * @returns {boolean} - True if HEIC format
 */
function isHeicFile(file) {
  if (!file) return false;
  const name = file.name?.toLowerCase() || '';
  const type = file.type?.toLowerCase() || '';
  return name.endsWith('.heic') || 
         name.endsWith('.heif') ||
         type === 'image/heic' ||
         type === 'image/heif';
}

/**
 * Generate a client-side thumbnail from an image file.
 * 
 * This is the main entry point used by the Thumbnail component.
 * Handles both regular images and HEIC files with memory-safe processing.
 * 
 * @param {File} file - Image file to process
 * @param {number} maxSize - Maximum thumbnail dimension (default: 400px)
 * @returns {Promise<Blob|null>} - Thumbnail blob, or null on failure
 */
export async function generateClientThumbnail(file, maxSize = MAX_THUMBNAIL_SIZE) {
  if (!file) {
    return null;
  }

  try {
    let sourceBlob = file;
    let isHeic = isHeicFile(file);

    // If not identified as HEIC by name/type, check content for magic numbers
    // This handles HEIC files incorrectly named as .JPG (common with iOS exports)
    if (!isHeic) {
      if (isSupportedImageType(file)) {
        try {
          // Read into a fresh buffer to ensure data is accessible and to check magic numbers
          const arrayBuffer = await file.arrayBuffer();
          const arr = new Uint8Array(arrayBuffer).subarray(0, 12);
          
          // Check for HEIC signature: 'ftyp' at offset 4
          if (arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70) {
            const brand = String.fromCharCode(...arr.subarray(8, 12));
            const heicBrands = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
            
            if (heicBrands.includes(brand)) {
              console.warn(`File ${file.name} has .JPG extension but appears to be HEIC. Converting...`);
              isHeic = true;
              sourceBlob = new Blob([arrayBuffer], { type: 'image/heic' });
            }
          }
          
          if (!isHeic) {
            // It's likely a real JPEG or other supported type
            // Create a fresh blob from the buffer
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

    // Check if image is suspiciously large
    if (img.width * img.height > 50000000) { // ~50 megapixels
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
 * Batch process multiple files with rate limiting to avoid memory spikes.
 * 
 * @param {File[]} files - Files to process
 * @param {Function} onProgress - Progress callback (index, total, file, error?)
 * @param {number} maxSize - Maximum thumbnail dimension
 * @returns {Promise<Map<string, Blob>>} - Map of filename to thumbnail blob
 */
export async function generateClientThumbnailBatch(files, onProgress = null, maxSize = MAX_THUMBNAIL_SIZE) {
  const results = new Map();

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
      await new Promise(resolve => setTimeout(resolve, 0));

    } catch (error) {
      console.error(`Batch processing failed for ${file.name}:`, error);
      
      if (onProgress) {
        onProgress(i + 1, files.length, file, error);
      }
    }
  }

  return results;
}

/**
 * Compress an image for upload to reduce transfer size and upload time.
 * 
 * This function is designed to run BEFORE uploading to the server:
 * - Resizes images larger than 2048px (width or height) 
 * - Converts to JPEG at 85% quality
 * - Handles HEIC files automatically
 * - Preserves aspect ratio
 * 
 * Performance Impact: Reduces upload time by ~10x for large photos.
 * 
 * @param {File} file - Image file to compress
 * @param {Object} options - Compression options
 * @param {number} [options.maxSize=2048] - Maximum dimension (width or height)
 * @param {number} [options.quality=0.85] - JPEG quality (0-1)
 * @returns {Promise<{blob: Blob, width: number, height: number, originalSize: number, compressedSize: number}>}
 */
export async function compressForUpload(file, options = {}) {
  const {
    maxSize = MAX_UPLOAD_SIZE,
    quality = UPLOAD_JPEG_QUALITY,
  } = options;

  if (!file) {
    throw new Error('No file provided for compression');
  }

  const originalSize = file.size;
  let sourceBlob = file;
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
    willReadFrequently: false
  });

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to JPEG blob
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
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
 * Compress multiple files for upload with progress callback.
 * 
 * @param {File[]} files - Array of files to compress
 * @param {Object} options - Options including onProgress callback
 * @returns {Promise<Map<string, {blob: Blob, ...}>>} - Map of filename to compression result
 */
export async function compressFilesForUpload(files, options = {}) {
  const { onProgress, maxSize, quality } = options;
  const results = new Map();

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
      await new Promise(resolve => setTimeout(resolve, 0));

    } catch (error) {
      console.error(`Compression failed for ${file.name}:`, error);
      
      if (onProgress) {
        onProgress({
          index: i + 1,
          total: files.length,
          file,
          error,
        });
      }
    }
  }

  return results;
}

export default {
  generateClientThumbnail,
  generateClientThumbnailBatch,
  compressForUpload,
  compressFilesForUpload,
};
