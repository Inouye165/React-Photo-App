const { createClient } = require('@supabase/supabase-js');
const knex = require('knex');
require('dotenv').config();

// Initialize connections
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const db = knex({
  client: 'pg',
  connection: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function debugDatabaseAndStorage() {
  try {
    console.log('🔍 Debugging database and storage state...\n');
    
    // Check database content
    console.log('📋 Database photos:');
    const photos = await db('photos').select('id', 'filename', 'state', 'storage_path', 'edited_filename').orderBy('id');
    
    if (photos.length === 0) {
      console.log('   No photos in database');
    } else {
      photos.forEach(photo => {
        const storagePath = photo.storage_path || `${photo.state}/${photo.edited_filename || photo.filename}`;
        console.log(`   ID ${photo.id}: ${photo.filename} (${photo.state}) -> ${storagePath}`);
      });
    }
    
    console.log(`\n📁 Supabase Storage content:`);
    
    // List all files in Supabase Storage
    const { data: storageFiles, error } = await supabase.storage
      .from('photos')
      .list('', { limit: 100, recursive: true });
    
    if (error) {
      console.log(`   Error: ${error.message}`);
    } else if (!storageFiles || storageFiles.length === 0) {
      console.log('   No files in storage');
    } else {
      storageFiles.forEach(file => {
        console.log(`   ${file.name} (${file.metadata?.size || 'unknown size'})`);
      });
    }
    
    // Check each folder
    const folders = ['working', 'inprogress', 'finished', 'thumbnails'];
    
    for (const folder of folders) {
      console.log(`\n📂 ${folder}/ folder:`);
      const { data: folderFiles, error: folderError } = await supabase.storage
        .from('photos')
        .list(folder, { limit: 100 });
      
      if (folderError) {
        console.log(`   Error: ${folderError.message}`);
      } else if (!folderFiles || folderFiles.length === 0) {
        console.log('   Empty');
      } else {
        folderFiles.forEach(file => {
          console.log(`   ${file.name} (${file.metadata?.size || 'unknown size'})`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await db.destroy();
  }
}

// Run the debug
debugDatabaseAndStorage();