import { type Knex } from 'knex';

const db = require('./db') as Knex;

type PhotoRow = {
  id: number;
  filename: string;
  metadata: string | null;
};

type PhotoMetadata = {
  latitude?: number | string;
  longitude?: number | string;
  GPSImgDirection?: number | string;
};

async function main(): Promise<void> {
  try {
    const photos = await db<PhotoRow>('photos')
      .where('filename', 'like', '%6132%')
      .orWhere('filename', 'like', '%6274%')
      .orWhere('filename', 'like', '%6390%')
      .select('id', 'filename', 'metadata');

    for (const photo of photos) {
      const metadata: PhotoMetadata = photo.metadata ? JSON.parse(photo.metadata) as PhotoMetadata : {};
      console.log(`\nPhoto ${photo.id}: ${photo.filename}`);
      console.log(`  Lat: ${metadata.latitude ?? 'n/a'}, Lon: ${metadata.longitude ?? 'n/a'}`);
      console.log(`  Direction: ${metadata.GPSImgDirection ?? 'n/a'}`);
    }
  } finally {
    await db.destroy();
  }
}

void main();