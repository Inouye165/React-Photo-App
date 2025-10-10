const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const exifr = require('exifr');
const sharp = require('sharp');
const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { convertHeicToJpegBuffer } = require('../media/image');

// Helper: Generate caption, description, keywords for a photo using OpenAI Vision
async function processPhotoAI({ filePath, metadata, gps, device }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in .env');

  // Extract and format date/time from EXIF
  let dateTimeInfo = '';
  if (metadata) {
    const dateOriginal = metadata.DateTimeOriginal || metadata.CreateDate || metadata.DateTime;
    if (dateOriginal) {
      try {
        const date = new Date(dateOriginal);
        const options = {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        };
        dateTimeInfo = date.toLocaleDateString('en-US', options);
      } catch (e) {
        dateTimeInfo = dateOriginal; // fallback to raw date if parsing fails
      }
    }
  }

  // Compose prompt with new requirements
  let prompt = `You are an expert photo analyst. Given the image and metadata, generate:\n- A short, human-friendly caption (max 10 words)\n- A detailed description that MUST include the date and time naturally in the text (covering people, animals, plants, weather, lighting, time of day, selfie detection, and location-based names for rivers, waterfalls, geysers, pools, cliffs, mountains, etc.)\n- A comma-separated list of keywords (for search) that MUST include GPS coordinates and camera device information if available\n\nMetadata:`;

  if (dateTimeInfo) prompt += ` Date/Time: ${dateTimeInfo}.`;
  if (metadata) prompt += ` EXIF: ${JSON.stringify(metadata)}.`;

  prompt += `\n\nIMPORTANT INSTRUCTIONS:
1. DESCRIPTION: Must naturally incorporate the date and time information (e.g., "This sunny afternoon photo taken on Tuesday, March 15th, 2024 at 2:30 PM shows...")
2. KEYWORDS: Must include GPS coordinates (if available) and camera device information (e.g., "iPhone 15 Pro, GPS:37.7749,-122.4194, sunset, beach")
3. Do NOT put GPS or device info in the description - only in keywords

Respond in JSON with keys: caption, description, keywords.`;

  // Add GPS and device to context for keywords
  if (device) prompt += `\nDevice Info: ${device}`;
  if (gps) prompt += `\nGPS Info: ${gps}`;

  // Convert HEIC/HEIF to JPEG if needed
  let imageBuffer, imageMime;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    imageBuffer = await convertHeicToJpegBuffer(filePath, 90);
    imageMime = 'image/jpeg';
  } else {
    imageBuffer = fs.readFileSync(filePath);
    imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
  }
  const imageBase64 = imageBuffer.toString('base64');
  const imageDataUri = `data:${imageMime};base64,${imageBase64}`;

  const messages = [
    { role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageDataUri } }
    ]}
  ];
  let response;
  try {
    response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 1024,
      temperature: 0.3
    });
  } catch (err) {
    throw err;
  }
  // Try to parse JSON from response
  let result = { caption: '', description: '', keywords: '' };
  try {
    const content = response.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    if (match) result = JSON.parse(match[0]);
    else result.description = content;
  } catch (e) {
    result.description = response.choices[0].message.content;
  }
  return result;
}

// Helper: Update photo AI metadata in DB with retry logic
async function updatePhotoAIMetadata(db, photoRow, filePath) {
  try {
    const meta = JSON.parse(photoRow.metadata || '{}');
    const gps = meta.GPSLatitude && meta.GPSLongitude ? `${meta.GPSLatitude},${meta.GPSLongitude}` : '';
    const device = meta.Make && meta.Model ? `${meta.Make} ${meta.Model}` : '';
    const retryCount = photoRow.ai_retry_count || 0;
    if (retryCount >= 5) {
      db.run('UPDATE photos SET caption = ?, description = ?, keywords = ?, ai_retry_count = ? WHERE id = ?',
        ['AI processing failed', 'AI processing failed', '', retryCount, photoRow.id]);
      return null;
    }
    let ai;
    try {
      ai = await processPhotoAI({ filePath, metadata: meta, gps, device });
    } catch (err) {
      db.run('UPDATE photos SET ai_retry_count = ? WHERE id = ?', [retryCount + 1, photoRow.id]);
      return null;
    }
    db.run('UPDATE photos SET caption = ?, description = ?, keywords = ?, ai_retry_count = ? WHERE id = ?',
      [ai.caption, ai.description, ai.keywords, 0, photoRow.id]);
    return ai;
  } catch (err) {
    return null;
  }
}

function isAIFailed(val) {
  return !val || val.trim().toLowerCase() === 'ai processing failed';
}

// On server start, process all inprogress photos missing AI metadata or with retry count < 2
async function processAllUnprocessedInprogress(db, INPROGRESS_DIR) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM photos WHERE state = ? AND (caption IS NULL OR description IS NULL OR keywords IS NULL OR ai_retry_count < 2)',
      ['inprogress'],
      async (err, rows) => {
        if (err) return reject(err);
        console.log(`[RECHECK] Found ${rows.length} inprogress files needing AI processing`);
        for (const row of rows) {
          if (
            !isAIFailed(row.caption) &&
            !isAIFailed(row.description) &&
            !isAIFailed(row.keywords) &&
            (!row.ai_retry_count || row.ai_retry_count < 2)
          ) {
            console.log(`[RECHECK] Skipping ${row.filename} (already has valid AI metadata)`);
            continue;
          }
          const filePath = path.join(INPROGRESS_DIR, row.filename);
          if (fs.existsSync(filePath)) {
            console.log(`[RECHECK] Processing AI metadata for ${row.filename}`);
            // eslint-disable-next-line no-await-in-loop
            await updatePhotoAIMetadata(db, row, filePath);
          } else {
            console.log(`[RECHECK] File not found for ${row.filename} at ${filePath}`);
          }
        }
        resolve(rows.length);
      }
    );
  });
}

module.exports = { processPhotoAI, updatePhotoAIMetadata, isAIFailed, processAllUnprocessedInprogress };