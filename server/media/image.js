const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const exifr = require('exifr');
const nodeCrypto = require('crypto');
const heicConvert = require('heic-convert');
const supabase = require('../lib/supabaseClient');

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp'];

async function hashFile(fileBuffer) {
  return nodeCrypto.createHash('sha256').update(fileBuffer).digest('hex');
}


async function generateThumbnail(fileBuffer, hash) {
  const thumbnailPath = `thumbnails/${hash}.jpg`;
  
  try {
    // Check if thumbnail already exists in Supabase Storage
    const { data: existingThumbnail } = await supabase.storage
      .from('photos')
      .list('thumbnails', { search: `${hash}.jpg` });
    
    if (existingThumbnail && existingThumbnail.length > 0) {
      return thumbnailPath; // Thumbnail already exists
    }
  } catch (error) {
    console.warn('Error checking for existing thumbnail:', error);
  }

  try {
    // Detect file type from buffer
    const metadata = await sharp(fileBuffer).metadata();
    const format = metadata.format;
    
    let thumbnailBuffer;
    if (format === 'heif') {
      // Convert HEIC/HEIF to JPEG buffer first
      try {
        const jpegBuffer = await convertHeicToJpegBuffer(fileBuffer, 70);
        thumbnailBuffer = await sharp(jpegBuffer)
          .resize(90, 90, { fit: 'inside' })
          .jpeg({ quality: 70 })
          .toBuffer();
      } catch (convErr) {
        console.error('Sharp thumbnail generation (via HEIC->JPEG) failed:', convErr.message || convErr);
        return null;
      }
    } else {
      thumbnailBuffer = await sharp(fileBuffer)
        .resize(90, 90, { fit: 'inside' })
        .jpeg({ quality: 70 })
        .toBuffer();
    }

    // Upload thumbnail to Supabase Storage
    const { data, error } = await supabase.storage
      .from('photos')
      .upload(thumbnailPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
        duplex: false
      });

    if (error) {
      console.error('Failed to upload thumbnail to Supabase:', error);
      return null;
    }

    return thumbnailPath;
  } catch (err) {
    console.error('Thumbnail generation failed:', err.message || err);
    return null;
  }
}

async function convertHeicToJpegBuffer(fileBuffer, quality = 90) {
  try {
    // Check if it's actually a HEIF file
    const metadata = await sharp(fileBuffer).metadata();
    if (metadata.format !== 'heif') {
      // If not HEIF, return as is
      return fileBuffer;
    }
    
    console.log('[CONVERT] Attempting HEIC->JPEG conversion, buffer size:', fileBuffer.length);
    const buffer = await sharp(fileBuffer).jpeg({ quality }).toBuffer();
    console.log('[CONVERT] HEIC->JPEG conversion successful, output size:', buffer.length);
    return buffer;
  } catch (err) {
    console.log('[CONVERT] Sharp conversion failed, trying heic-convert fallback:', err.message);
    try {
      const outputBuffer = await heicConvert({
        buffer: fileBuffer,
        format: 'JPEG',
        quality: quality / 100 // heic-convert quality is 0 to 1
      });
      console.log('[CONVERT] heic-convert fallback successful, buffer size:', outputBuffer.length);
      return outputBuffer;
    } catch (fallbackErr) {
      console.error('[CONVERT] heic-convert fallback conversion FAILED:', fallbackErr.message || fallbackErr);
      throw new Error(`HEIC conversion failed. Sharp error: ${err.message}, Fallback error: ${fallbackErr.message}`);
    }
  }
}



async function ensureAllThumbnails(db) {
  // Get all photos from database
  const photos = await db('photos').select('id', 'filename', 'hash', 'state', 'storage_path');
  
  // Limit concurrent conversions to avoid spawning too many processes
  const CONCURRENCY_LIMIT = parseInt(process.env.THUMB_CONCURRENCY || '2', 10);
  const queue = [];
  
  for (const photo of photos) {
    if (photo.hash) {
      const job = async () => {
        try {
          // Download file from Supabase Storage
          const storagePath = photo.storage_path || `${photo.state}/${photo.filename}`;
          const { data: fileData, error } = await supabase.storage
            .from('photos')
            .download(storagePath);
          
          if (error) {
            console.warn(`Failed to download ${storagePath} for thumbnail generation:`, error);
            return;
          }
          
          const fileBuffer = await fileData.arrayBuffer();
          await generateThumbnail(Buffer.from(fileBuffer), photo.hash);
        } catch (e) {
          console.error('Thumbnail gen error for', photo.filename, e && (e.message || e));
        }
      };
      queue.push(job);
    }
  }

  // Run the queue with limited concurrency
  const workers = new Array(CONCURRENCY_LIMIT).fill(null).map(async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (job) await job();
    }
  });
  await Promise.all(workers);
}

async function ingestPhoto(db, storagePath, filename, state, fileBuffer) {
  try {
    const hash = await hashFile(fileBuffer);
    const existing = await db('photos').where({ hash }).select('id').first();
    if (existing) {
      console.log(`Duplicate file skipped: ${filename}`);
      return { duplicate: true, hash };
    }
    
    const metadata = await exifr.parse(fileBuffer, { 
      tiff: true, ifd0: true, exif: true, gps: true, xmp: true, icc: true, iptc: true 
    });
    const metaStr = JSON.stringify(metadata || {});
    const fileSize = fileBuffer.length;
    const now = new Date().toISOString();
    
    await db('photos').insert({
      filename,
      state,
      metadata: metaStr,
      hash,
      file_size: fileSize,
      storage_path: storagePath,
      created_at: now,
      updated_at: now
    }).onConflict('filename').merge();
    
    await generateThumbnail(fileBuffer, hash);
    return { duplicate: false, hash };
  } catch (err) {
    console.error('Metadata/hash extraction failed for', filename, err);
    return { duplicate: false, hash: null };
  }
}

module.exports = { generateThumbnail, ensureAllThumbnails, ingestPhoto, convertHeicToJpegBuffer };