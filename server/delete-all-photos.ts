import type { Knex } from 'knex';

type PhotoRow = {
  storage_path: string | null;
};

type SupabaseLike = {
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ error?: { message?: string } | null }>;
    };
  };
};

const db = require('./db') as Knex;
const supabase = require('./lib/supabaseClient') as SupabaseLike;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function deleteAllPhotos(): Promise<void> {
  console.log('Starting cleanup...\n');

  try {
    const photos = await db<PhotoRow>('photos').select('*');
    console.log(`Found ${photos.length} photos in database\n`);

    let storageDeleted = 0;
    for (const photo of photos) {
      if (!photo.storage_path) {
        continue;
      }

      try {
        const { error } = await supabase.storage.from('photos').remove([photo.storage_path]);

        if (!error) {
          console.log(`Deleted from storage: ${photo.storage_path}`);
          storageDeleted += 1;
        } else {
          console.log(`Storage delete failed: ${photo.storage_path} - ${error.message}`);
        }
      } catch (error: unknown) {
        console.log(`Storage error: ${photo.storage_path} - ${getErrorMessage(error)}`);
      }
    }

    console.log(`\nDeleted ${storageDeleted} files from storage\n`);

    const deleted = await db('photos').delete();
    console.log(`Deleted ${deleted} records from database\n`);

    console.log('Cleanup complete!');
  } catch (error: unknown) {
    console.error('Error during cleanup:', error);
  } finally {
    await db.destroy();
  }
}

void deleteAllPhotos();