require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const photoIds = [143, 146, 148, 150, 153, 154, 155, 156, 157, 159];

const knex = require('knex');
const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

async function testPhotoAccess() {
  console.log('Testing access to all 10 finished photos...\n');
  
  for (const id of photoIds) {
    const photo = await db('photos').where('id', id).first();
    if (!photo) {
      console.log(`❌ Photo ${id}: Not in database`);
      continue;
    }
    
    const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;
    
    const { data, error } = await supabase.storage
      .from('photos')
      .download(storagePath);
    
    if (error) {
      console.log(`❌ Photo ${id}: Storage download FAILED`);
      console.log(`   Path: ${storagePath}`);
      console.log(`   Error: ${error.message || JSON.stringify(error)}`);
    } else {
      console.log(`✅ Photo ${id}: OK (${data.size} bytes)`);
    }
  }
  
  await db.destroy();
}

testPhotoAccess().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
