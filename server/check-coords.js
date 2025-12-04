const db = require('./db');

(async () => {
  const photos = await db('photos')
    .where('filename', 'like', '%6132%')
    .orWhere('filename', 'like', '%6274%')
    .orWhere('filename', 'like', '%6390%')
    .select('id', 'filename', 'metadata');
  
  for (const photo of photos) {
    const meta = JSON.parse(photo.metadata);
    console.log(`\nPhoto ${photo.id}: ${photo.filename}`);
    console.log(`  Lat: ${meta.latitude}, Lon: ${meta.longitude}`);
    console.log(`  Direction: ${meta.GPSImgDirection}`);
  }
  
  await db.destroy();
})();
