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

// Helper: convert feet to meters
function feetToMeters(feet) {
  return Math.max(1, Math.round(feet * 0.3048));
}

// Helper: reverse geocode via Nominatim to get address/place info
async function nominatimReverse(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'React-Photo-App/1.0 (your-email@example.com)'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    return null;
  }
}

// Helper: query Overpass API for named features within radius (meters)
async function overpassNearby(lat, lon, radiusMeters = 50) {
  try {
    // Query nodes/ways/rels with a name tag within radius
    const q = `[
out:json][timeout:25];(node(around:${radiusMeters},${lat},${lon})["name"];way(around:${radiusMeters},${lat},${lon})["name"];rel(around:${radiusMeters},${lat},${lon})["name"];);out center;`;
    const url = 'https://overpass-api.de/api/interpreter';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'React-Photo-App/1.0 (your-email@example.com)'
      },
      body: `data=${encodeURIComponent(q)}`
    });
    if (!res.ok) return null;
    const data = await res.json();
    const names = new Set();
    if (data.elements && Array.isArray(data.elements)) {
      for (const el of data.elements) {
        if (el.tags && el.tags.name) names.add(el.tags.name);
      }
    }
    return Array.from(names);
  } catch (err) {
    return null;
  }
}

// High-level geolocation helper: given gps string "lat,lon" and radiusFeet, return nearby place names and reverse lookup
async function geolocateNearby(gpsString, radiusFeet = 50) {
  if (!gpsString) return { address: null, nearby: [] };
  const [latStr, lonStr] = gpsString.split(',').map(s => s && s.trim());
  if (!latStr || !lonStr) return { address: null, nearby: [] };
  const lat = parseFloat(latStr);
  const lon = parseFloat(lonStr);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return { address: null, nearby: [] };
  const radiusMeters = feetToMeters(radiusFeet);
  const [addr, nearby] = await Promise.all([
    nominatimReverse(lat, lon),
    overpassNearby(lat, lon, radiusMeters)
  ]);
  return { address: addr, nearby: nearby || [] };
}

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

    // Compose prompt with expanded requirements: ask for places, animals, focused description, and extensive keywords
    let prompt = `You are an expert photo analyst. Given the image and metadata, generate the following in JSON (keys: caption, description, keywords, places, animals):\n\n- caption: A short, human-friendly caption (max 10 words).\n- description: A focused, detailed description that MUST include the date and time naturally in the text and cover relevant visual elements (people, animals with breed/type if identifiable, plants, weather, lighting, time of day, and notable geographic or man-made landmarks). Make the description as long as necessary to be informative but do NOT add extraneous information not supported by the image.\n- places: An array of any pinpointable place/facility/site names visible or strongly implied in the image (e.g., restaurant name, park name, waterfall name, mountain peak, river name, hotel, store, historical site). If none can be confidently determined, return an empty array.\n- animals: An array of objects for animals detected with fields {type, breed (if identifiable), confidence (0-1)}; return an empty array if no animals.\n- keywords: A comma-separated, extensive set of search keywords that MUST include GPS coordinates (if available), camera device information (if available), place names (if any), animal breed/type (if any), and other descriptive tags (e.g., sunset, long-exposure, portrait, travel, hiking).\n\nMetadata:`;

  if (dateTimeInfo) prompt += ` Date/Time: ${dateTimeInfo}.`;
  if (metadata) prompt += ` EXIF: ${JSON.stringify(metadata)}.`;

  prompt += `\n\nIMPORTANT INSTRUCTIONS:
1. DESCRIPTION: Must naturally incorporate the date and time information (e.g., "This sunny afternoon photo taken on Tuesday, March 15th, 2024 at 2:30 PM shows...")
2. KEYWORDS: Must include GPS coordinates (if available) and camera device information (e.g., "iPhone 15 Pro, GPS:37.7749,-122.4194, sunset, beach")
3. Do NOT put GPS or device info in the description - only in keywords

Respond in JSON with keys: caption, description, keywords.`;

  // Add GPS and device to context for keywords
    prompt += `\nDevice Info: ${device}`;
    if (gps) prompt += `\nGPS Info: ${gps}`;

  // If GPS provided, enrich prompt with nearby place names using geolocation lookups
  let geoContext = null;
  if (gps) {
    try {
      geoContext = await geolocateNearby(gps, 50); // 50 feet radius
      if (geoContext && geoContext.address) {
        const displayName = geoContext.address.display_name || null;
        if (displayName) prompt += `\nReverse geocode: ${displayName}`;
      }
      if (geoContext && Array.isArray(geoContext.nearby) && geoContext.nearby.length > 0) {
        prompt += `\nNearby named features within 50ft: ${geoContext.nearby.join(', ')}`;
      }
    } catch (e) {
      // ignore geolocation failures
    }
  }

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
        max_tokens: 1500,
        temperature: 0.25
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
    if (gps && !result.keywords.includes('GPS') && !result.keywords.includes(gps)) {
      result.keywords = result.keywords ? (result.keywords + `, GPS:${gps}`) : `GPS:${gps}`;
    }
    if (device && !result.keywords.includes(device)) {
      result.keywords = result.keywords ? (result.keywords + `, ${device}`) : device;
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