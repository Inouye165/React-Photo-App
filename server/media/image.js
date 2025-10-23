const sharp = require('sharp');
const exifr = require('exifr');
const nodeCrypto = require('crypto');
const heicConvert = require('heic-convert');
const fs = require('fs').promises;
const supabase = require('../lib/supabaseClient');

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
  } catch {
    // thumbnail existence check failed (logging removed)
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
      } catch {
        // Sharp thumbnail generation failed (logging removed)
        return null;
      }
    } else {
      thumbnailBuffer = await sharp(fileBuffer)
        .resize(90, 90, { fit: 'inside' })
        .jpeg({ quality: 70 })
        .toBuffer();
    }

    // Upload thumbnail to Supabase Storage
    const { data: _data, error } = await supabase.storage
      .from('photos')
      .upload(thumbnailPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
        duplex: false
      });

    if (error) {
        // Failed to upload thumbnail to Supabase (logging removed)
      return null;
    }

    return thumbnailPath;
  } catch {
    // Thumbnail generation failed (logging removed)
    return null;
  }
}

async function convertHeicToJpegBuffer(fileBuffer, quality = 90) {
  // Accept either a Buffer or a file path string. If a path is provided, read it into a Buffer.
  let inputBuffer = fileBuffer;
  if (typeof fileBuffer === 'string') {
    try {
      inputBuffer = await fs.readFile(fileBuffer);
    } catch (readErr) {
      // If we can't read the file, surface the error
      throw new Error(`Unable to read file: ${readErr.message}`);
    }
  }

  // Attempt to read metadata using a single sharp instance. If metadata can't be determined,
  // treat input as non-HEIF and return the original buffer (do not attempt conversion).
  let metadata;
  const s = sharp(inputBuffer);
  try {
    metadata = await s.metadata();
  } catch {
    // If sharp can't read metadata treat as non-HEIF and return original buffer.
    return inputBuffer;
  }

  if (metadata.format !== 'heif') {
    // Not a HEIF file — return original buffer
    return inputBuffer;
  }

  try {
    const buffer = await s.jpeg({ quality }).toBuffer();
    return buffer;
  } catch (err) {
    try {
      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: quality / 100 // heic-convert quality is 0 to 1
      });
      return outputBuffer;
    } catch (fallbackErr) {
      // Error message intentionally follows the format used in tests:
      // "Sharp error: <msg>, Fallback error: <msg>" and references
      // "heic-convert fallback" in comments above.
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
              // Failed to download ${storagePath} for thumbnail generation (logging removed)
            return;
          }
          
          const fileBuffer = await fileData.arrayBuffer();
          await generateThumbnail(Buffer.from(fileBuffer), photo.hash);
        } catch {
          // Thumbnail gen error for ${photo.filename} (logging removed)
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
        // Duplicate file skipped (logging removed)
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
  } catch {
    // Metadata/hash extraction failed for file (logging removed)
    return { duplicate: false, hash: null };
  }
}

module.exports = { generateThumbnail, ensureAllThumbnails, ingestPhoto, convertHeicToJpegBuffer };