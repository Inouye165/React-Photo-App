import dotenv from 'dotenv';
import knexFactory from 'knex';

dotenv.config();

type FinishedPhoto = {
  id: number;
  filename: string | null;
  storage_path: string | null;
  user_id: string | null;
};

const db = knexFactory({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

async function listFinishedPhotos(): Promise<void> {
  const photos = await db<FinishedPhoto>('photos')
    .where('state', 'finished')
    .select('id', 'filename', 'storage_path', 'user_id')
    .orderBy('id');

  console.log('Finished photos:');
  photos.forEach((photo) => {
    const filename = photo.filename || '(missing filename)';
    const shortFilename = filename.length > 50 ? `${filename.substring(0, 47)}...` : filename;
    console.log(`ID ${photo.id}: ${shortFilename}`);
    console.log(`  Storage: ${photo.storage_path || '(missing storage path)'}`);
    console.log(`  Owner: ${photo.user_id ? `${photo.user_id.substring(0, 8)}...` : '(missing user)'}`);
  });

  await db.destroy();
}

listFinishedPhotos().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});