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

async function cleanupOrphanedRecords() {
  try {
    console.log('🔍 Checking for orphaned photo records...');
    
    // Get all photos from database
    const photos = await db('photos').select('id', 'filename', 'state', 'storage_path', 'edited_filename');
    
    let orphanedCount = 0;
    let validCount = 0;
    const orphanedIds = [];
    
    for (const photo of photos) {
      // Determine the storage path
      const storagePath = photo.storage_path || `${photo.state}/${photo.edited_filename || photo.filename}`;
      
      try {
        // Check if file exists in Supabase Storage
        const { data, error } = await supabase.storage
          .from('photos')
          .list(storagePath.includes('/') ? storagePath.split('/')[0] : '', {
            search: storagePath.includes('/') ? storagePath.split('/')[1] : storagePath
          });
        
        if (error || !data || data.length === 0) {
          console.log(`❌ Orphaned: ${photo.filename} (ID: ${photo.id}) - Storage path: ${storagePath}`);
          orphanedIds.push(photo.id);
          orphanedCount++;
        } else {
          console.log(`✅ Valid: ${photo.filename} (ID: ${photo.id})`);
          validCount++;
        }
      } catch (err) {
        console.log(`❌ Error checking ${photo.filename}: ${err.message}`);
        orphanedIds.push(photo.id);
        orphanedCount++;
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Valid records: ${validCount}`);
    console.log(`   Orphaned records: ${orphanedCount}`);
    
    if (orphanedCount > 0) {
      console.log(`\n🗑️  Deleting ${orphanedCount} orphaned records...`);
      
      // Delete orphaned records
      const deleteResult = await db('photos').whereIn('id', orphanedIds).del();
      
      console.log(`✅ Deleted ${deleteResult} orphaned records from database`);
    } else {
      console.log(`\n✅ No orphaned records found - database is clean!`);
    }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await db.destroy();
  }
}

// Run the cleanup
cleanupOrphanedRecords();