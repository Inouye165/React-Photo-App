/**
 * Delete all photos from database and Supabase Storage
 */

const db = require('./db');
const supabase = require('./lib/supabaseClient');

async function deleteAllPhotos() {
  console.log('Starting cleanup...\n');
  
  try {
    // Get all photos from database
    const photos = await db('photos').select('*');
    console.log(`Found ${photos.length} photos in database\n`);
    
    // Delete from Supabase Storage
    let storageDeleted = 0;
    for (const photo of photos) {
      if (photo.storage_path) {
        try {
          const { error } = await supabase.storage
            .from('photos')
            .remove([photo.storage_path]);
          
          if (!error) {
            console.log(`✓ Deleted from storage: ${photo.storage_path}`);
            storageDeleted++;
          } else {
            console.log(`⚠ Storage delete failed: ${photo.storage_path} - ${error.message}`);
          }
        } catch (err) {
          console.log(`⚠ Storage error: ${photo.storage_path} - ${err.message}`);
        }
      }
    }
    
    console.log(`\nDeleted ${storageDeleted} files from storage\n`);
    
    // Delete from database
    const deleted = await db('photos').delete();
    console.log(`Deleted ${deleted} records from database\n`);
    
    console.log('✓ Cleanup complete!');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await db.destroy();
  }
}

deleteAllPhotos();
