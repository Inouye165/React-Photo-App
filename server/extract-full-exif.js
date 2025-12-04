const db = require('knex')(require('./knexfile.js').development);
const { downloadFromStorage } = require('./media/backgroundProcessor');
const exifr = require('exifr');

async function extractFullExif() {
  try {
    const photo = await db('photos').where('id', 165).first();
    if (!photo) {
      console.log('Photo 165 not found');
      return;
    }

    console.log('Attempting to download:', photo.filename);
    
    // Try original file
    let buffer;
    try {
      buffer = await downloadFromStorage(photo.filename);
      console.log('Downloaded original file:', buffer.length, 'bytes');
    } catch {
      console.log('Original failed, trying .processed.jpg version');
      const processedFilename = photo.filename.replace(/\.heic$/i, '.heic.processed.jpg');
      buffer = await downloadFromStorage(processedFilename);
      console.log('Downloaded processed file:', buffer.length, 'bytes');
    }

    console.log('\nExtracting ALL EXIF data...\n');
    
    const fullExif = await exifr.parse(buffer, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      iptc: true,
      jfif: true,
      ihdr: true,
      translateKeys: false,
      translateValues: false,
      reviveValues: false,
      sanitize: false,
      mergeOutput: false,
      silentErrors: true
    });

    console.log('Full EXIF data:');
    console.log(JSON.stringify(fullExif, null, 2));
    
    console.log('\n=== GPS Heading Related Fields ===');
    const headingFields = [
      'GPSImgDirection',
      'GPSImgDirectionRef',
      'GPSDestBearing',
      'GPSDestBearingRef',
      'GPSTrack',
      'GPSTrackRef'
    ];
    
    headingFields.forEach(field => {
      if (fullExif && fullExif[field] !== undefined) {
        console.log(`${field}:`, fullExif[field]);
      }
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

extractFullExif();
