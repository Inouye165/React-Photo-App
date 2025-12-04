/**
 * Fix GPS coordinates in database - convert DMS arrays to decimal degrees
 */

const db = require('./db');

function dmsToDecimal(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && value.length >= 2) {
    const [degrees, minutes, seconds = 0] = value;
    return degrees + minutes / 60 + seconds / 3600;
  }
  return null;
}

async function fixGPSCoordinates() {
  console.log('Fixing GPS coordinates in database...\n');
  
  const photos = await db('photos').select('id', 'filename', 'metadata');
  
  let fixed = 0;
  let skipped = 0;
  
  for (const photo of photos) {
    try {
      const meta = JSON.parse(photo.metadata);
      
      // Check if coordinates need fixing (are they arrays OR is longitude positive when it should be negative?)
      const needsFix = Array.isArray(meta.latitude) || 
                      Array.isArray(meta.GPSLatitude) ||
                      Array.isArray(meta.gps?.lat) ||
                      (meta.GPSLongitudeRef === 'W' && meta.longitude > 0) ||
                      (meta.GPSLongitudeRef === 'W' && meta.GPSLongitude > 0);
      
      if (!needsFix) {
        skipped++;
        continue;
      }
      
      // Convert to decimal
      const lat = dmsToDecimal(meta.GPSLatitude || meta.latitude);
      const lon = dmsToDecimal(meta.GPSLongitude || meta.longitude);
      
      if (lat != null && lon != null) {
        // Apply hemisphere signs (S and W are negative)
        let finalLat = lat;
        let finalLon = lon;
        
        if (meta.GPSLatitudeRef === 'S') {
          finalLat = -Math.abs(lat);
        }
        if (meta.GPSLongitudeRef === 'W') {
          finalLon = -Math.abs(lon);
        }
        
        meta.latitude = finalLat;
        meta.longitude = finalLon;
        meta.GPSLatitude = finalLat;
        meta.GPSLongitude = finalLon;
        
        if (meta.gps) {
          meta.gps.lat = finalLat;
          meta.gps.lon = finalLon;
        }
        
        if (meta.GPS) {
          meta.GPS.latitude = finalLat;
          meta.GPS.longitude = finalLon;
        }
        
        await db('photos')
          .where({ id: photo.id })
          .update({ metadata: JSON.stringify(meta) });
        
        console.log(`✓ Fixed photo ${photo.id}: ${photo.filename}`);
        console.log(`  ${finalLat}, ${finalLon}\n`);
        fixed++;
      }
    } catch (err) {
      console.error(`✗ Error fixing photo ${photo.id}:`, err.message);
    }
  }
  
  console.log(`\nDone! Fixed ${fixed} photos, skipped ${skipped} photos.`);
  await db.destroy();
}

fixGPSCoordinates();
