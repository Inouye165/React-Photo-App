const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// LangChain-friendly helper: local EXIF extractor tool
const { extractExif } = require('./langchain/exifTool');
const { geolocate } = require('./langchain/geolocateTool');
const { buildPrompt, parseOutputToJSON } = require('./langchain/promptTemplate');
const { convertHeicToJpegBuffer } = require('../media/image');

// Helper: Generate caption, description, keywords for a photo using OpenAI Vision
async function processPhotoAI({ filePath, metadata, gps, device }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in .env');

  // Extract and format date/time from EXIF
  let dateTimeInfo = '';
  // If metadata wasn't passed in, extract it from the file as the first pipeline step
  if (!metadata || (typeof metadata === 'object' && Object.keys(metadata).length === 0)) {
    try {
      // extractExif is small and non-fatal; if it fails we proceed with empty metadata
      // this makes it easy to convert this step to a LangChain Tool later
       
      metadata = await extractExif(filePath) || {};
    } catch {
      metadata = {};
    }
  }
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
      } catch {
        dateTimeInfo = dateOriginal; // fallback to raw date if parsing fails
      }
    }
  }

    // If gps not passed, try to derive it from metadata
    if (!gps) {
      try {
        if (metadata && metadata.GPSLatitude && metadata.GPSLongitude) {
          gps = `${metadata.GPSLatitude},${metadata.GPSLongitude}`;
        }
      } catch {
        // ignore
      }
    }

    // Enrich with geolocation lookups if GPS available
    let geoContext = null;
    if (gps) {
      try {
        geoContext = await geolocate({ gpsString: gps, radiusFeet: 50, userAgent: process.env.NOMINATIM_USER_AGENT });
      } catch {
        geoContext = null;
      }
    }

    // Build prompt via centralized template helper
    const prompt = buildPrompt({ dateTimeInfo, metadata, device, gps, geoContext });

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
  // Route LLM call through a LangChain-friendly adapter to make future swaps easier
  const { runChain } = require('./langchain/chainAdapter');
  let response;
  try {
    // pass filePath/metadata/gps/device so the simpleChain (if enabled) can
    // construct messages from the file directly. The OpenAI path ignores
    // these extra args and uses the provided `messages` as-is.
    response = await runChain({ messages, model: 'gpt-4o', max_tokens: 1500, temperature: 0.25, filePath, metadata, gps, device });
  } catch (err) {
    throw err;
  }
  // Try to parse JSON from response using the centralized parser
  let result = { caption: '', description: '', keywords: '' };
  try {
    const content = response.choices[0].message.content;
    const parsed = parseOutputToJSON(content);
    if (parsed) result = parsed; else result.description = content;
  } catch {
    result.description = response.choices[0].message.content;
  }
    // Normalize fields and ensure keywords include GPS and device and any places/animals
    result.caption = (result.caption || '').trim();
    result.description = (result.description || '').trim();
    result.keywords = (result.keywords || '').trim();

    // If places array provided, append to keywords if not present
    if (Array.isArray(result.places) && result.places.length > 0) {
      const missingPlaces = result.places.filter(p => p && !result.keywords.includes(p));
      if (missingPlaces.length > 0) {
        result.keywords = result.keywords ? (result.keywords + ', ' + missingPlaces.join(', ')) : missingPlaces.join(', ');
      }
    }

    // If animals array provided, append type/breed to keywords if not present
    if (Array.isArray(result.animals) && result.animals.length > 0) {
      const animalTags = result.animals.flatMap(a => {
        const parts = [];
        if (a.type) parts.push(a.type);
        if (a.breed) parts.push(a.breed);
        return parts;
      }).filter(Boolean);
      const missingAnimals = animalTags.filter(t => !result.keywords.includes(t));
      if (missingAnimals.length > 0) {
        result.keywords = result.keywords ? (result.keywords + ', ' + missingAnimals.join(', ')) : missingAnimals.join(', ');
      }
    }

    // Ensure GPS and device info are present in keywords if provided in context
    // Check for various GPS formats: "GPS:", "GPS coordinates", or the actual coordinates
    const hasGPS = result.keywords.includes('GPS') ||
                   result.keywords.includes(gps) ||
                   /\d+\.\d+,\s*-\d+\.\d+/.test(result.keywords); // latitude,longitude pattern

    if (gps && !hasGPS) {
      result.keywords = result.keywords ? (result.keywords + `, GPS:${gps}`) : `GPS:${gps}`;
    }
    if (device && !result.keywords.includes(device)) {
      result.keywords = result.keywords ? (result.keywords + `, ${device}`) : device;
    }

    // Append the AI method used to keywords for transparency
    if (response._ctx && response._ctx.method) {
      const methodTag = `AI:${response._ctx.method}`;
      if (!result.keywords.includes(methodTag)) {
        result.keywords = result.keywords ? (result.keywords + `, ${methodTag}`) : methodTag;
      }
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
    } catch {
      db.run('UPDATE photos SET ai_retry_count = ? WHERE id = ?', [retryCount + 1, photoRow.id]);
      return null;
    }
    db.run('UPDATE photos SET caption = ?, description = ?, keywords = ?, ai_retry_count = ? WHERE id = ?',
      [ai.caption, ai.description, ai.keywords, 0, photoRow.id]);
    return ai;
  } catch {
    return null;
  }
}

function isAIFailed(val) {
  return !val || val.trim().toLowerCase() === 'ai processing failed';
}

// On server start, process all inprogress photos missing AI metadata or with retry count < 2
async function processAllUnprocessedInprogress(db, INPROGRESS_DIR) {
  return new Promise((resolve, _reject) => {
    db.all(
      'SELECT * FROM photos WHERE state = ? AND (caption IS NULL OR description IS NULL OR keywords IS NULL OR ai_retry_count < 2)',
      ['inprogress'],
      async (err, rows) => {
        if (err) return _reject(err);
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