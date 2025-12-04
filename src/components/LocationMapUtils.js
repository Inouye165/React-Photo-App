/**
 * Helper to extract lat/lon/heading from photo metadata.
 * Exported for testing and potential reuse.
 * 
 * @param {Object} photo - Photo object with potential GPS metadata
 * @returns {Object|null} - { lat, lng, heading } or null if no valid location found
 */
export function getPhotoLocation(photo) {
  if (!photo) return null;

  let heading = 0;
  
  // Try to find heading/bearing with proper validation
  const headingCandidates = [
    photo.metadata?.GPS?.imgDirection,
    photo.metadata?.GPSImgDirection,
    photo.GPSImgDirection
  ];
  
  for (const candidate of headingCandidates) {
    if (candidate != null) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        heading = parsed;
        break;
      }
    }
  }
  
  // Helper to validate coordinate ranges
  const isValidLat = (lat) => Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const isValidLng = (lng) => Number.isFinite(lng) && lng >= -180 && lng <= 180;
  
  // 1. Check top-level lat/lon (common from exifr)
  if (photo.latitude != null && photo.longitude != null) {
    const lat = Number(photo.latitude);
    const lng = Number(photo.longitude);
    if (isValidLat(lat) && isValidLng(lng)) {
      return { lat, lng, heading };
    }
  }
  
  const meta = photo.metadata || {};
  
  // 2. Check metadata top-level
  if (meta.latitude != null && meta.longitude != null) {
    const lat = Number(meta.latitude);
    const lng = Number(meta.longitude);
    if (isValidLat(lat) && isValidLng(lng)) {
      return { lat, lng, heading };
    }
  }
  
  // 3. Check GPS object (uppercase)
  if (meta.GPS) {
    if (meta.GPS.latitude != null && meta.GPS.longitude != null) {
      const lat = Number(meta.GPS.latitude);
      const lng = Number(meta.GPS.longitude);
      if (isValidLat(lat) && isValidLng(lng)) {
        return { lat, lng, heading };
      }
    }
  }
  
  // 4. Check gps object (lowercase) with lat/lon
  if (meta.gps) {
    if (meta.gps.lat != null && meta.gps.lon != null) {
      const lat = Number(meta.gps.lat);
      const lng = Number(meta.gps.lon);
      if (isValidLat(lat) && isValidLng(lng)) {
        return { lat, lng, heading };
      }
    }
  }

  // 5. Check for gps string "lat,lon" if available (some backend scripts populate this)
  if (photo.gps_string) {
    const parts = photo.gps_string.split(',').map(part => part.trim());
    if (parts.length === 2) {
      const lat = Number(parts[0]);
      const lng = Number(parts[1]);
      if (isValidLat(lat) && isValidLng(lng)) {
        return { lat, lng, heading };
      }
    }
  }

  return null;
}
