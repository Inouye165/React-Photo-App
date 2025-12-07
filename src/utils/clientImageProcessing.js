/**
 * Client Image Processing Utility
 * 
 * Handles client-side image operations including thumbnail generation
 * with memory-safe processing for high-resolution images.
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
 * (non-HEIC types that browsers can natively handle)
 * @param {File} file - The file to check
 * @returns {boolean} - True if supported natively, false otherwise
 */
export function isSupportedImageType(file) {
  if (!file || !file.type) return false;
  const supportedTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/bmp',
  ]);
  return supportedTypes.has(file.type.toLowerCase());
}

/**
 * Load an image from a Blob/File.
 * @param {Blob} blob - The blob to load
 * @returns {Promise<HTMLImageElement>} - The loaded image element
 */
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    const cleanup = () => URL.revokeObjectURL(url);
    
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    
    img.onerror = () => {
      cleanup();
      reject(new Error('Failed to load image'));
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

    // Convert HEIC to JPEG first if needed
    const isHeic = isHeicFile(file);

    if (isHeic) {
      try {
        sourceBlob = await convertHeicToJpeg(file);
      } catch (heicError) {
        console.warn(`HEIC conversion failed for ${file.name}:`, heicError);
        // Return null to trigger fallback in Thumbnail component
        return null;
      }
    } else if (!isSupportedImageType(file)) {
      // Non-HEIC unsupported type
      return null;
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

export default {
  generateClientThumbnail,
  generateClientThumbnailBatch
};
