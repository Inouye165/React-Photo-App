import type { Knex } from 'knex';

const db = require('./db') as Knex;

type DmsTuple = [number, number, number?];

type PhotoRow = {
  id: number;
  filename: string;
  metadata: string | Record<string, unknown> | null;
};

type GpsRecord = {
  lat?: number;
  lon?: number;
};

type MetadataRecord = Record<string, unknown> & {
  latitude?: unknown;
  longitude?: unknown;
  GPSLatitude?: unknown;
  GPSLongitude?: unknown;
  GPSLatitudeRef?: unknown;
  GPSLongitudeRef?: unknown;
  gps?: GpsRecord;
  GPS?: Record<string, unknown> & {
    latitude?: number;
    longitude?: number;
  };
};

function dmsToDecimal(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && value.length >= 2) {
    const [degrees, minutes, seconds = 0] = value as DmsTuple;
    return degrees + minutes / 60 + seconds / 3600;
  }
  return null;
}

function parseMetadata(metadata: PhotoRow['metadata']): MetadataRecord | null {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    return JSON.parse(metadata) as MetadataRecord;
  }
  return metadata as MetadataRecord;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fixGPSCoordinates(): Promise<void> {
  console.log('Fixing GPS coordinates in database...\n');

  try {
    const photos = await db<PhotoRow>('photos').select('id', 'filename', 'metadata');

    let fixed = 0;
    let skipped = 0;

    for (const photo of photos) {
      try {
        const metadata = parseMetadata(photo.metadata);
        if (!metadata) {
          skipped += 1;
          continue;
        }

        const needsFix =
          Array.isArray(metadata.latitude) ||
          Array.isArray(metadata.GPSLatitude) ||
          Array.isArray(metadata.gps?.lat) ||
          (metadata.GPSLongitudeRef === 'W' && typeof metadata.longitude === 'number' && metadata.longitude > 0) ||
          (metadata.GPSLongitudeRef === 'W' && typeof metadata.GPSLongitude === 'number' && metadata.GPSLongitude > 0);

        if (!needsFix) {
          skipped += 1;
          continue;
        }

        const latitude = dmsToDecimal(metadata.GPSLatitude ?? metadata.latitude);
        const longitude = dmsToDecimal(metadata.GPSLongitude ?? metadata.longitude);

        if (latitude == null || longitude == null) {
          skipped += 1;
          continue;
        }

        let finalLatitude = latitude;
        let finalLongitude = longitude;

        if (metadata.GPSLatitudeRef === 'S') {
          finalLatitude = -Math.abs(latitude);
        }
        if (metadata.GPSLongitudeRef === 'W') {
          finalLongitude = -Math.abs(longitude);
        }

        metadata.latitude = finalLatitude;
        metadata.longitude = finalLongitude;
        metadata.GPSLatitude = finalLatitude;
        metadata.GPSLongitude = finalLongitude;

        if (metadata.gps) {
          metadata.gps.lat = finalLatitude;
          metadata.gps.lon = finalLongitude;
        }

        if (metadata.GPS) {
          metadata.GPS.latitude = finalLatitude;
          metadata.GPS.longitude = finalLongitude;
        }

        await db('photos').where({ id: photo.id }).update({ metadata: JSON.stringify(metadata) });

        console.log(`Fixed photo ${photo.id}: ${photo.filename}`);
        console.log(`  ${finalLatitude}, ${finalLongitude}\n`);
        fixed += 1;
      } catch (error: unknown) {
        console.error(`Error fixing photo ${photo.id}:`, getErrorMessage(error));
      }
    }

    console.log(`\nDone! Fixed ${fixed} photos, skipped ${skipped} photos.`);
  } finally {
    await db.destroy();
  }
}

void fixGPSCoordinates();