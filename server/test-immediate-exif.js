/**
 * Test script to verify immediate EXIF extraction from HEIC files
 * This simulates what the upload endpoint does after receiving a file
 */

const fs = require('fs');
const path = require('path');
const { extractMetadata } = require('./media/backgroundProcessor');

async function testImmediateExif() {
  const testFile = 'C:\\Users\\inouy\\OneDrive\\Pictures\\A-folder\\IMG_1712.HEIC';
  
  console.log('Testing immediate EXIF extraction...');
  console.log('File:', testFile);
  console.log('---');
  
  try {
    // Read the file as a buffer (simulating what we get from Supabase)
    const buffer = fs.readFileSync(testFile);
    console.log(`✓ File loaded: ${buffer.length} bytes`);
    
    // Extract metadata
    const metadata = await extractMetadata(buffer, path.basename(testFile));
    
    console.log('\n=== EXTRACTED METADATA ===');
    console.log('Has GPS:', !!(metadata.latitude && metadata.longitude));
    console.log('Latitude:', metadata.latitude);
    console.log('Longitude:', metadata.longitude);
    console.log('GPSImgDirection:', metadata.GPSImgDirection);
    console.log('GPSDestBearing:', metadata.GPSDestBearing);
    console.log('Compass Heading:', metadata.GPSImgDirection || metadata.GPSDestBearing || 'Not found');
    
    // Check the nested structures
    if (metadata.gps) {
      console.log('\nNested gps object:');
      console.log('  lat:', metadata.gps.lat);
      console.log('  lon:', metadata.gps.lon);
      console.log('  direction:', metadata.gps.direction);
    }
    
    if (metadata.GPS) {
      console.log('\nNested GPS object:');
      console.log('  latitude:', metadata.GPS.latitude);
      console.log('  longitude:', metadata.GPS.longitude);
      console.log('  imgDirection:', metadata.GPS.imgDirection);
    }
    
    console.log('\n✓ Test completed successfully');
    console.log('---');
    console.log('Result: Compass direction is', 
      metadata.GPSImgDirection || metadata.GPSDestBearing ? 'AVAILABLE' : 'NOT AVAILABLE');
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error(error);
  }
}

testImmediateExif();
