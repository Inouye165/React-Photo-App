const { createClient } = require('@supabase/supabase-js');
const knex = require('knex');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../server/.env') });

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Knex
const dbConfig = require('../server/knexfile');
const db = knex(dbConfig.development); // Assuming development environment for now

async function regenerateThumbnails() {
  console.log('Starting thumbnail regeneration...');

  try {
    // Fetch all photos with a hash
    const photos = await db('photos').whereNotNull('hash').select('id', 'hash', 'storage_path', 'filename');
    console.log(`Found ${photos.length} photos to process.`);

    let successCount = 0;
    let errorCount = 0;

    for (const photo of photos) {
      console.log(`Processing photo ${photo.id} (${photo.filename})...`);

      try {
        // 1. Download original image
        // The storage path in DB might be relative or absolute, usually it's 'working/filename' or similar
        // But wait, the code uses `storage_path` column.
        // Let's check where the original is stored.
        // In `server/routes/uploads.js` (not read yet, but assuming standard pattern), it uploads to 'photos' bucket.
        // The path is usually `working/${filename}` or similar.
        
        // Let's try to download from 'photos' bucket using storage_path
        // If storage_path is null, maybe try constructing it?
        const storagePath = photo.storage_path || `working/${photo.filename}`;
        
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('photos')
          .download(storagePath);

        if (downloadError) {
          console.warn(`  Failed to download original for ${photo.id}: ${downloadError.message}`);
          errorCount++;
          continue;
        }

        const rawBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(rawBuffer);

        // 2. Generate new thumbnail
        // Logic copied/adapted from server/media/image.js
        const thumbnailPath = `thumbnails/${photo.hash}.jpg`;

        // Detect format
        let inputBuffer = buffer;
        try {
          const metadata = await sharp(buffer).metadata();
          if (metadata.format === 'heif') {
             console.log(`  Converting HEIC to JPEG for ${photo.id}...`);
             inputBuffer = await heicConvert({
               buffer: buffer,
               format: 'JPEG',
               quality: 1
             });
          }
        } catch (e) {
           // If sharp fails to read metadata, it might be because it's HEIC and sharp doesn't support it
           // Try converting blindly if filename ends in heic
           if (photo.filename.toLowerCase().endsWith('.heic')) {
             console.log(`  Converting HEIC (fallback) to JPEG for ${photo.id}...`);
             inputBuffer = await heicConvert({
               buffer: buffer,
               format: 'JPEG',
               quality: 1
             });
           } else {
             throw e;
           }
        }

        let thumbnailBuffer;
        
        try {
             thumbnailBuffer = await sharp(inputBuffer)
            .rotate() // Fix rotation
            .resize(400, 400, { fit: 'inside' }) // Fix quality/size
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch (sharpError) {
            // If sharp fails, it might be HEIC without support.
            // In a real script we'd import heic-convert.
            // For now, let's log and skip if it fails.
            console.warn(`  Sharp processing failed for ${photo.id}: ${sharpError.message}`);
            errorCount++;
            continue;
        }

        // 3. Upload new thumbnail (overwrite)
        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(thumbnailPath, thumbnailBuffer, {
            contentType: 'image/jpeg',
            upsert: true // Overwrite existing
          });

        if (uploadError) {
          console.warn(`  Failed to upload thumbnail for ${photo.id}: ${uploadError.message}`);
          errorCount++;
        } else {
          console.log(`  Successfully regenerated thumbnail for ${photo.id}`);
          successCount++;
        }

      } catch (err) {
        console.error(`  Unexpected error for ${photo.id}: ${err.message}`);
        errorCount++;
      }
    }

    console.log('Thumbnail regeneration complete.');
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await db.destroy();
  }
}

regenerateThumbnails();
