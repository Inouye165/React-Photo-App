const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { exiftool } = require('exiftool-vendored');
const logger = require('../logger');

/**
 * Extract full metadata from an image file using exiftool-vendored.
 * Returns a normalized object with "Insight Data" (GPS, Lens, ISO, Model)
 * while ignoring "Editing Data" (color profiles, binary thumbnails).
 * 
 * @param {string} filePath - Absolute path to the image file
 * @returns {Promise<Object>} Normalized metadata object with created_at, gps, device, exposure, user_comment
 */
async function extractMetadata(filePath) {
  try {
    logger.debug(`[extractMetadata] Reading EXIF from: ${filePath}`);
    const tags = await exiftool.read(filePath);
    logger.debug(`[extractMetadata] Successfully read ${Object.keys(tags).length} tags`);
    
    // Helper to normalize date from various EXIF date fields
    const normalizeDate = () => {
      const candidates = [
        tags.DateTimeOriginal,
        tags.CreateDate,
        tags.DateCreated,
        tags.DateTimeDigitized,
        tags.ModifyDate
      ];
      for (const candidate of candidates) {
        if (candidate instanceof Date && !isNaN(candidate.getTime())) {
          return candidate;
        }
      }
      return null;
    };

    // Helper to extract GPS coordinates
    const extractGPS = () => {
      const lat = tags.GPSLatitude;
      const lon = tags.GPSLongitude;
      const alt = tags.GPSAltitude;
      const direction = tags.GPSImgDirection || tags.GPSDestBearing;
      
      if (typeof lat === 'number' && typeof lon === 'number') {
        return {
          lat,
          lon,
          alt: typeof alt === 'number' ? alt : null,
          direction: typeof direction === 'number' ? direction : null
        };
      }
      return null;
    };

    // Helper to extract device information
    const extractDevice = () => {
      return {
        make: tags.Make || null,
        model: tags.Model || null,
        lens: tags.LensModel || tags.LensInfo || null,
        software: tags.Software || null
      };
    };

    // Helper to extract exposure settings
    const extractExposure = () => {
      return {
        f_stop: tags.FNumber || tags.ApertureValue || null,
        shutter_speed: tags.ExposureTime || tags.ShutterSpeedValue || null,
        iso: tags.ISO || null,
        flash_fired: tags.Flash ? String(tags.Flash).toLowerCase().includes('fired') : null
      };
    };

    // Extract user comment
    const userComment = tags.UserComment || tags.ImageDescription || null;

    return {
      created_at: normalizeDate(),
      gps: extractGPS(),
      device: extractDevice(),
      exposure: extractExposure(),
      user_comment: userComment
    };
  } catch (error) {
    logger.error(`[extractMetadata] Failed to extract metadata from ${filePath}:`, error.message, error.stack);
    // Return minimal object on failure
    return {
      created_at: null,
      gps: null,
      device: { make: null, model: null, lens: null, software: null },
      exposure: { f_stop: null, shutter_speed: null, iso: null, flash_fired: null },
      user_comment: null
    };
  }
}

async function copyExifMetadata(sourcePath, destPath) {
  try {
    const exiftoolBin = exiftool;
    const command = `"${exiftoolBin}" -TagsFromFile "${sourcePath}" -all:all -overwrite_original "${destPath}"`;
    await execPromise(command, { windowsHide: true, timeout: 30000 });
    logger.info(`✓ Copied EXIF metadata: ${path.basename(sourcePath)} → ${path.basename(destPath)}`);
    return true;
  } catch (error) {
    logger.error(`✗ Failed to copy EXIF metadata: ${error.message}`);
    return false;
  }
}

async function removeExifOrientation(destPath) {
  try {
    const exiftoolBin = exiftool;
    await execPromise(`"${exiftoolBin}" -Orientation= -overwrite_original "${destPath}"`, { windowsHide: true, timeout: 10000 });
    logger.info('✓ Removed EXIF orientation from edited file');
    return true;
  } catch (error) {
    logger.warn('✗ Failed to remove EXIF orientation:', error.message);
    return false;
  }
}

module.exports = { copyExifMetadata, removeExifOrientation, extractMetadata };