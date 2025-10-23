const knex = require('knex');
require('dotenv').config();

const db = knex({
  client: 'pg',
  connection: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkThumbnailPaths() {
  try {
    console.log('🔍 Checking what thumbnail URLs are being generated...\n');
    
    // Get a few photos to see their thumbnail paths
    const photos = await db('photos').select('id', 'filename', 'hash').limit(3);
    
    console.log('📸 Sample photos and their expected thumbnail URLs:');
    
    for (const photo of photos) {
      if (photo.hash) {
        const thumbnailUrl = `/display/thumbnails/${photo.hash}.jpg`;
        console.log(`   ${photo.filename} (ID: ${photo.id})`);
        console.log(`   Hash: ${photo.hash}`);
        console.log(`   Thumbnail URL: ${thumbnailUrl}`);
        console.log('');
      } else {
        console.log(`   ${photo.filename} (ID: ${photo.id}) - No hash, no thumbnail`);
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.destroy();
  }
}

checkThumbnailPaths();