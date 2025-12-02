require('dotenv').config();
const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  useNullAsDefault: true
});

async function checkAuthState() {
  console.log('=== Checking Authentication State ===\n');
  
  const users = await db('users').select('*');
  console.log(`Found ${users.length} users in database:`);
  users.forEach(u => {
    console.log(`  - ID: ${u.id}`);
    console.log(`    Created: ${u.created_at}`);
  });
  
  console.log('\n=== Photo 108 Details ===');
  const photo = await db('photos').where('id', 108).first();
  if (photo) {
    console.log(`  Owner ID: ${photo.user_id}`);
    console.log(`  State: ${photo.state}`);
    console.log(`  Filename: ${photo.filename}`);
    console.log(`  Storage Path: ${photo.storage_path}`);
    
    const matchingUser = users.find(u => u.id === photo.user_id);
    if (matchingUser) {
      console.log(`  ✅ User record exists for this photo`);
    } else {
      console.log(`  ❌ No user record for this photo's user_id`);
    }
  } else {
    console.log('  Photo 108 not found');
  }
  
  await db.destroy();
}

checkAuthState().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
