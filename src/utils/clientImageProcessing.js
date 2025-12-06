/**
 * Client-Side Image Processing Utility
 * 
 * Generates high-quality JPEG thumbnails from user files before upload.
 * Uses native browser APIs for optimal performance with no heavy dependencies.
 */

// Supported MIME types for client-side processing
const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

// Thumbnail output configuration
const THUMBNAIL_CONFIG = {
  maxDimension: 400,
  quality: 0.8,
  outputType: 'image/jpeg',
};

/**
 * Check if the file type is supported for client-side thumbnail generation
 * @param {File} file - The file to check
 * @returns {boolean} - True if supported, false otherwise
 */
export function isSupportedImageType(file) {
  if (!file || !file.type) return false;
  return SUPPORTED_TYPES.has(file.type.toLowerCase());
}

/**
 * Calculate scaled dimensions maintaining aspect ratio
 * @param {number} width - Original width
 * @param {number} height - Original height
 * @param {number} maxDimension - Maximum dimension for either side
 * @returns {{width: number, height: number}} - Scaled dimensions
 */
export function calculateScaledDimensions(width, height, maxDimension) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const aspectRatio = width / height;

  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension / aspectRatio),
    };
  } else {
    return {
      width: Math.round(maxDimension * aspectRatio),
      height: maxDimension,
    };
  }
}

/**
 * Load an image using createImageBitmap (preferred, off-main-thread)
 * @param {File} file - The image file
 * @returns {Promise<ImageBitmap>} - The loaded image bitmap
 */
async function loadImageBitmap(file) {
  return await createImageBitmap(file);
}

/**
 * Load an image using Image element (fallback for older browsers)
 * @param {File} file - The image file
 * @returns {Promise<HTMLImageElement>} - The loaded image element
 */
function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Cleanup to prevent memory leak
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl); // Cleanup on error too
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

/**
 * Draw image to canvas and export as JPEG blob
 * @param {ImageBitmap|HTMLImageElement} imageSource - The image to draw
 * @param {number} targetWidth - Target canvas width
 * @param {number} targetHeight - Target canvas height
 * @returns {Promise<Blob|null>} - The resulting JPEG blob or null on failure
 */
function drawToCanvas(imageSource, targetWidth, targetHeight) {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      // Use high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Draw the image scaled to fit the canvas
      ctx.drawImage(imageSource, 0, 0, targetWidth, targetHeight);

      // Convert to JPEG blob
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        THUMBNAIL_CONFIG.outputType,
        THUMBNAIL_CONFIG.quality
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Generate a client-side thumbnail from a user's file
 * 
 * @param {File} file - The image file to process
 * @returns {Promise<Blob|null>} - A JPEG thumbnail blob, or null if:
 *   - File type is not supported (HEIC, TIFF, video, etc.)
 *   - Browser cannot process the image
 *   - Any error occurs during processing
 * 
 * @example
 * const thumbnail = await generateClientThumbnail(file);
 * if (thumbnail) {
 *   // Use the thumbnail
 *   const url = URL.createObjectURL(thumbnail);
 * } else {
 *   // Fall back to server-side processing
 * }
 */
export async function generateClientThumbnail(file) {
  try {
    // Safety: Reject unsupported file types immediately
    if (!isSupportedImageType(file)) {
      return null;
    }

    let imageSource;
    let sourceWidth;
    let sourceHeight;

    // Try createImageBitmap first (faster, off-main-thread)
    if (typeof createImageBitmap === 'function') {
      try {
        imageSource = await loadImageBitmap(file);
        sourceWidth = imageSource.width;
        sourceHeight = imageSource.height;
      } catch {
        // Fall through to Image fallback
        imageSource = null;
      }
    }

    // Fallback to Image + Canvas approach
    if (!imageSource) {
      try {
        imageSource = await loadImageElement(file);
        sourceWidth = imageSource.naturalWidth || imageSource.width;
        sourceHeight = imageSource.naturalHeight || imageSource.height;
      } catch {
        return null;
      }
    }

    // Validate dimensions
    if (!sourceWidth || !sourceHeight) {
      // Cleanup ImageBitmap if applicable
      if (imageSource && typeof imageSource.close === 'function') {
        imageSource.close();
      }
      return null;
    }

    // Calculate target dimensions maintaining aspect ratio
    const { width: targetWidth, height: targetHeight } = calculateScaledDimensions(
      sourceWidth,
      sourceHeight,
      THUMBNAIL_CONFIG.maxDimension
    );

    // Draw to canvas and get the blob
    const blob = await drawToCanvas(imageSource, targetWidth, targetHeight);

    // Cleanup ImageBitmap to free memory
    if (imageSource && typeof imageSource.close === 'function') {
      imageSource.close();
    }

    return blob;
  } catch {
    // Any unexpected error: return null, server will be our fallback
    return null;
  }
}

export default generateClientThumbnail;
