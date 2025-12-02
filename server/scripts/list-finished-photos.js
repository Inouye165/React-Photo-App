require('dotenv').config();
const knex = require('knex');

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL
});

async function listFinishedPhotos() {
  const photos = await db('photos')
    .where('state', 'finished')
    .select('id', 'filename', 'storage_path', 'user_id')
    .orderBy('id');
  
  console.log('Finished photos:');
  photos.forEach(p => {
    const shortFilename = p.filename.length > 50 ? p.filename.substring(0, 47) + '...' : p.filename;
    console.log(`ID ${p.id}: ${shortFilename}`);
    console.log(`  Storage: ${p.storage_path}`);
    console.log(`  Owner: ${p.user_id.substring(0, 8)}...`);
  });
  
  await db.destroy();
}

listFinishedPhotos().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
