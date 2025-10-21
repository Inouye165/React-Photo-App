const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { extractExif } = require('./langchain/exifTool');
const { geolocate } = require('./langchain/geolocateTool');
const { locationDetectiveTool } = require('./langchain/locationDetective');
const { photoPOIIdentifierTool } = require('./langchain/photoPOIIdentifier');
const { buildPrompt, parseOutputToJSON } = require('./langchain/promptTemplate');
const { convertHeicToJpegBuffer } = require('../media/image');

// Helper function to convert DMS (degrees, minutes, seconds) to decimal degrees
function dmsToDecimal(degrees, minutes = 0, seconds = 0) {
  return degrees + (minutes / 60) + (seconds / 3600);
}

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
          // Convert DMS arrays to decimal degrees
          const latDMS = Array.isArray(metadata.GPSLatitude) ? metadata.GPSLatitude : [metadata.GPSLatitude];
          const lonDMS = Array.isArray(metadata.GPSLongitude) ? metadata.GPSLongitude : [metadata.GPSLongitude];

          const latDecimal = dmsToDecimal(latDMS[0], latDMS[1] || 0, latDMS[2] || 0);
          const lonDecimal = dmsToDecimal(lonDMS[0], lonDMS[1] || 0, lonDMS[2] || 0);

          // Apply hemisphere signs
          const latSign = metadata.GPSLatitudeRef === 'S' ? -1 : 1;
          const lonSign = metadata.GPSLongitudeRef === 'W' ? -1 : 1;

          gps = `${latDecimal * latSign},${lonDecimal * lonSign}`;
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
      } catch (error) {
        console.error('Geolocation lookup failed:', error.message || error);
        geoContext = null;
      }
    }

    // Location detective analysis
    let locationAnalysis = null;
    if (gps) {
      try {
        const detectiveResult = await locationDetectiveTool.invoke({
          gpsString: gps,
          dateTimeInfo: dateTimeInfo,
          description: '', // Will be filled by AI
          keywords: '', // Will be filled by AI
          geoContext: geoContext
        });
        locationAnalysis = JSON.parse(detectiveResult);
      } catch (error) {
        console.error('Location detective analysis failed:', error.message || error);
        locationAnalysis = null;
      }
    }

    // Initialize poiAnalysis for buildPrompt (will be null for LangChain path)
    let poiAnalysis = null;

    // Build prompt via centralized template helper (updated with POI analysis)
    const prompt = buildPrompt({ dateTimeInfo, metadata, device, gps, geoContext, locationAnalysis, poiAnalysis });

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

    // Advanced POI identification (moved after imageBuffer is created)
    if (gps && imageBuffer) {
      try {
        const imageData = imageBuffer.toString('base64');
        const [latitude, longitude] = gps.split(',').map(coord => coord.trim());
        const poiResult = await photoPOIIdentifierTool.invoke({
          imageData,
          latitude,
          longitude,
          timestamp: dateTimeInfo
        });
        poiAnalysis = JSON.parse(poiResult);
      } catch (error) {
        console.error('POI identification failed:', error);
        poiAnalysis = null;
      }
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
    console.error('AI processing failed:', err.message || err);
    throw err;
  }

  // Add our analysis context to the response
  if (!response._ctx) response._ctx = {};
  response._ctx.geoContext = geoContext;
  response._ctx.locationAnalysis = locationAnalysis;
  // Attach POI analysis to context (from direct path or LangChain path)
  response._ctx.poiAnalysis = poiAnalysis;
  // Try to parse JSON from response using the centralized parser
  let result = { caption: '', description: '', keywords: '' };
  try {
    const content = response.choices[0].message.content;
    const parsed = parseOutputToJSON(content);
    if (parsed) result = parsed; else result.description = content;
  } catch (error) {
    console.error('Failed to parse AI response:', error.message || error);
    console.error('Raw response content:', response.choices[0].message.content);
    result.description = response.choices[0].message.content;
  }

  console.log('AI processing result before POI attachment:', JSON.stringify(result, null, 2));
  console.log('POI analysis from context:', JSON.stringify(response._ctx.poiAnalysis, null, 2));
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

    // Include POI analysis results in the response
    if (response._ctx && response._ctx.poiAnalysis) {
      result.poiAnalysis = response._ctx.poiAnalysis;

      // Add POI information to keywords if available
      const poiAnalysis = response._ctx.poiAnalysis;
      if (poiAnalysis.best_match && poiAnalysis.best_match.name) {
        const poiTag = `POI:${poiAnalysis.best_match.name}`;
        if (!result.keywords.includes(poiTag)) {
          result.keywords = result.keywords ? (result.keywords + `, ${poiTag}`) : poiTag;
        }
      }

      // Add scene type to keywords
      if (poiAnalysis.scene_type && poiAnalysis.scene_type !== 'other') {
        const sceneTag = `Scene:${poiAnalysis.scene_type}`;
        if (!result.keywords.includes(sceneTag)) {
          result.keywords = result.keywords ? (result.keywords + `, ${sceneTag}`) : sceneTag;
        }
      }
    }

  return result;
}

// Helper: Update photo AI metadata in DB with retry logic
async function updatePhotoAIMetadata(db, photoRow, filePath) {
  try {
    const meta = JSON.parse(photoRow.metadata || '{}');
    
    // Convert DMS GPS coordinates to decimal degrees
    let gps = '';
    if (meta.GPSLatitude && meta.GPSLongitude) {
      const latDMS = Array.isArray(meta.GPSLatitude) ? meta.GPSLatitude : [meta.GPSLatitude];
      const lonDMS = Array.isArray(meta.GPSLongitude) ? meta.GPSLongitude : [meta.GPSLongitude];
      
      const latDecimal = latDMS[0] + (latDMS[1] || 0) / 60 + (latDMS[2] || 0) / 3600;
      const lonDecimal = lonDMS[0] + (lonDMS[1] || 0) / 60 + (lonDMS[2] || 0) / 3600;
      
      // Apply hemisphere signs
      const latSign = meta.GPSLatitudeRef === 'S' ? -1 : 1;
      const lonSign = meta.GPSLongitudeRef === 'W' ? -1 : 1;
      
      gps = `${latDecimal * latSign},${lonDecimal * lonSign}`;
    }
    
    const device = meta.Make && meta.Model ? `${meta.Make} ${meta.Model}` : '';
    const retryCount = photoRow.ai_retry_count || 0;
    if (retryCount >= 5) {
      console.error(`AI processing failed permanently for ${photoRow.filename} after ${retryCount} retries`);
      await db('photos').where({ id: photoRow.id }).update({
        caption: 'AI processing failed',
        description: 'AI processing failed',
        keywords: '',
        ai_retry_count: retryCount,
        poi_analysis: null
      });
      return null;
    }
    let ai;
    try {
      ai = await processPhotoAI({ filePath, metadata: meta, gps, device });
    } catch (error) {
      console.error(`AI processing failed for ${photoRow.filename} (attempt ${retryCount + 1}):`, error.message || error);
      await db('photos').where({ id: photoRow.id }).update({ ai_retry_count: retryCount + 1 });
      return null;
    }
    await db('photos').where({ id: photoRow.id }).update({
      caption: ai.caption,
      description: ai.description,
      keywords: ai.keywords,
      ai_retry_count: 0,
      poi_analysis: JSON.stringify(ai.poiAnalysis || null)
    });
    return ai;
  } catch (error) {
    console.error(`Unexpected error in updatePhotoAIMetadata for ${photoRow.filename}:`, error.message || error);
    return null;
  }
}

function isAIFailed(val) {
  return !val || val.trim().toLowerCase() === 'ai processing failed';
}

// On server start, process all inprogress photos missing AI metadata or with retry count < 2
async function processAllUnprocessedInprogress(db, INPROGRESS_DIR) {
  try {
    const rows = await db('photos')
      .where({ state: 'inprogress' })
      .andWhere(function() {
        this.whereNull('caption')
          .orWhereNull('description')
          .orWhereNull('keywords')
          .orWhere('ai_retry_count', '<', 2);
      });
    
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
    return rows.length;
  } catch (error) {
    console.error('[RECHECK] Error processing unprocessed inprogress files:', error);
    throw error;
  }
}

module.exports = { processPhotoAI, updatePhotoAIMetadata, isAIFailed, processAllUnprocessedInprogress };