// @ts-nocheck

'use strict';

const DEFAULT_GPS_KEYS = [
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'GPSLatitude',
  'GPSLongitude',
  'GPSLatitudeRef',
  'GPSLongitudeRef',
  'GPSPosition',
  'GPSAltitude',
  'GPSAltitudeRef',
  'GPSHPositioningError',
  'GPSDateStamp',
  'GPSTimeStamp',
  'gps',
  'GPS'
];

const GPS_DIRECTION_KEYS = new Set([
  'GPSImgDirection',
  'GPSImgDirectionRef',
  'GPSDestBearing',
  'GPSDestBearingRef'
]);

function sanitizePhotoMetadata(metadata, options = {}) {
  const storeGpsCoords = options.storeGpsCoords === true;

  if (!metadata || typeof metadata !== 'object') {
    return metadata;
  }

  if (storeGpsCoords) {
    return metadata;
  }

  const output = { ...metadata };

  // Remove common top-level coordinate fields
  for (const key of Object.keys(output)) {
    const lowerKey = key.toLowerCase();

    // Keep explicit direction-bearing fields even though they start with GPS
    if (GPS_DIRECTION_KEYS.has(key)) {
      continue;
    }

    // Drop any coordinate-like fields by name
    if (
      DEFAULT_GPS_KEYS.includes(key) ||
      lowerKey === 'latitude' ||
      lowerKey === 'longitude' ||
      lowerKey === 'lat' ||
      lowerKey === 'lng' ||
      lowerKey === 'lon' ||
      lowerKey.startsWith('gps')
    ) {
      delete output[key];
      continue;
    }
  }

  return output;
}

module.exports = {
  sanitizePhotoMetadata
};
