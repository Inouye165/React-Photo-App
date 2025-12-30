/*
  Debug runner for LangGraph full workflow.
  - Invokes classify_image, location_intelligence_agent, and router logic
  - Logs inputs/outputs and tokens for each LLM call
  - Uses existing repo functions where possible (reverseGeocode, nearbyPlaces, nearbyTrailsFromOSM)
  - This file purposely copies prompts and logic from server/ai/langgraph/graph.js for visibility
*/

require('../../env'); // load .env
const { openai } = require('../openaiClient');
const { reverseGeocode, nearbyPlaces } = require('../poi/googlePlaces');
const { nearbyFoodPlaces: _nearbyFoodPlaces } = require('../poi/foodPlaces');
const { nearbyTrailsFromOSM } = require('../poi/osmTrails');
const _logger = require('../../logger');

function maskSecrets(obj) {
  const s = JSON.stringify(obj, null, 2);
  return s.replace(/(OPENAI_API_KEY|GOOGLE_PLACES_API_KEY|GOOGLE_MAPS_API_KEY|API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)[^\n]*/gi, '***');
}

async function logApiCall(apiName, inputs, outputs, durationMs, extraInfo) {
  console.log('='.repeat(80));
  console.log(`🔵 API CALL: ${apiName}`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`⏱️  Duration: ${(durationMs / 1000).toFixed(2)}s`);
  console.log('\n📥 INPUTS:');
  console.log(maskSecrets(inputs));
  console.log('\n📤 OUTPUTS:');
  console.log(maskSecrets(outputs));
  if (extraInfo) {
    console.log('\n📊 EXTRA INFO:');
    console.log(maskSecrets(extraInfo));
  }
  console.log('='.repeat(80));
  console.log('\n');
}

const { CLASSIFY_USER_PROMPT, CLASSIFY_SYSTEM_PROMPT } = require('./prompts/classify_image');

async function classify_image(state) {
  // For debugging we will call the model unless classification_override present
  if (state.classification_override) {
    console.log('[DEBUG] classification override present:', state.classification_override);
    return { ...state, classification: state.classification_override };
  }

  const userContent = [
    { type: 'text', text: CLASSIFY_USER_PROMPT },
    { type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'low' } },
  ];
  const start = Date.now();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    max_tokens: 64,
    response_format: { type: 'json_object' },
  });
  const end = Date.now();
  const out = response?.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try {
    parsed = JSON.parse(out);
  } catch (_err) {
    void _err;
    parsed = { classification: 'unknown' };
  }
  await logApiCall('classify_image', { prompt: CLASSIFY_USER_PROMPT }, { response: parsed }, end - start, { rawChoice: out, usage: response.usage });
  return { ...state, classification: parsed.classification || 'unknown' };
}

// --- Copy location intelligence system prompt ---
const { LOCATION_INTEL_SYSTEM_PROMPT } = require('./prompts/location_intelligence_agent');

async function location_intelligence_agent(state) {
  // If no GPS available return quickly
  const coords = state.coords;
  if (!coords || coords.lat == null || coords.lon == null) {
    console.log('[DEBUG] No coordinates - skipping location intelligence.');
    return { ...state, poiAnalysis: null };
  }
  const start = Date.now();

  // 1. reverse geocode
  const reverse = await reverseGeocode(coords.lat, coords.lon);
  // 2. nearby places (Google Places) - skipped for food classifications to avoid
  // making generic POI queries when a food-specific agent will handle
  // restaurant lookups.
  const classificationLower = (String(state.classification || '') || '').toLowerCase();
  const skipGenericPoi = classificationLower.includes('food');
  if (skipGenericPoi) {
    console.log('[DEBUG] classification is food - skipping generic nearby POI lookup');
  }
  const nearby = skipGenericPoi ? [] : await nearbyPlaces(coords.lat, coords.lon, 800);
  // 3. OSM trails
  let osmTrails = [];
  try {
    const classificationLower = (String(state.classification || '') || '').toLowerCase();
    const OSM_SKIP_CATEGORIES = (process.env.OSM_SKIP_CATEGORIES || 'food').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const shouldSkipOsm = OSM_SKIP_CATEGORIES.some((c) => classificationLower.includes(c));
    if (shouldSkipOsm) {
      console.log('[DEBUG] Skipping OSM trails lookup for food classification');
      osmTrails = [];
    } else {
      const osmDefaultRadius = Number(process.env.OSM_TRAILS_DEFAULT_RADIUS_METERS || 200);
      osmTrails = await nearbyTrailsFromOSM(coords.lat, coords.lon, osmDefaultRadius);
    }
  } catch (err) {
    console.warn('[DEBUG] OSM lookup failed', err && err.message ? err.message : err);
  }

  const LOCATION_USER_PROMPT = require('./prompts/location_intelligence_agent').LOCATION_INTEL_USER_PROMPT;
  const userPrompt = LOCATION_USER_PROMPT.replace('{structuredContext}', JSON.stringify({ gps_string: `${coords.lat},${coords.lon}`, nearby_places: nearby, nearby_trails_osm: osmTrails }, null, 2));

    // LOCATION_INTEL_SYSTEM_PROMPT is imported at top of file
    const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
       messages: [ { role: 'system', content: LOCATION_INTEL_SYSTEM_PROMPT }, { role: 'user', content: userPrompt } ],
    max_tokens: 400,
    response_format: { type: 'json_object' },
  });
  const end = Date.now();
  const raw = response?.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    void _err;
    parsed = {};
  }

  await logApiCall('location_intelligence_agent', { structuredContext: { coords, reverse, nearby, osmTrails }, prompt: LOCATION_INTEL_SYSTEM_PROMPT }, { parsed, reverseResult: reverse, nearbyPlaces: nearby, osmTrails }, end - start, { raw });

  const locationIntel = {
    city: parsed.city || (reverse?.city || 'unknown'),
    region: parsed.region || (reverse?.region || 'unknown'),
    nearest_landmark: parsed.nearest_landmark || (nearby[0] ? nearby[0].name : 'unknown'),
    nearest_park: parsed.nearest_park || 'unknown',
    nearest_trail: parsed.nearest_trail || (osmTrails[0] ? osmTrails[0].name : 'unknown'),
    description_addendum: parsed.description_addendum || 'Additional geographic insight unavailable.',
  };

  const poiAnalysis = {
    locationIntel,
    city: locationIntel.city,
    region: locationIntel.region,
    nearest_landmark: locationIntel.nearest_landmark,
    nearest_park: locationIntel.nearest_park,
    nearest_trail: locationIntel.nearest_trail,
    nearbyPOIs: nearby,
    nearbyTrailsOSM: osmTrails,
  };
  return { ...state, poiAnalysis };
}

function route_after_location(state) {
  if (state.error) return 'END';
  const classification = String((state.classification || '')).toLowerCase().trim();
  if (classification === 'collectables') return 'handle_collectible';
  if (classification === 'food') return 'food_location_agent';
  const needPoi = Boolean(state.poiAnalysis && state.poiAnalysis.gpsString);
  if (needPoi && (classification === 'scenery' || classification.includes('scenery'))) return 'decide_scene_label';
  return 'generate_metadata';
}

const fs = require('fs');
const path = require('path');

function guessMimeFromExt(p) {
  const ext = (path.extname(p) || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.heic' || ext === '.heif') return 'image/heic';
  return 'application/octet-stream';
}

async function runFlow(opts = {}) {
  const { testName, classificationOverride, lat = 34.0522, lon = -118.2437 } = opts;
  const singleNode = opts.singleNode || opts.node || null;
  console.log('==== Running test: ', testName, '====');

  // Support providing a local image path (--image) to use a test image instead of an empty payload
  const imagePath = opts.imagePath || opts.image || null;
  let imageBase64 = '';
  let imageMime = 'image/jpeg';
  if (imagePath) {
    try {
      const resolved = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
      const buf = fs.readFileSync(resolved);
      imageBase64 = buf.toString('base64');
      imageMime = guessMimeFromExt(resolved);
      console.log('[DEBUG] Using image from', resolved);
    } catch (err) {
      console.warn('[DEBUG] Unable to read image file', imagePath, err && err.message ? err.message : err);
    }
  }

  const state = {
    filename: `${testName}.jpg`,
    gpsString: `${lat},${lon}`,
    coords: { lat, lon },
    metadata: {},
    imageMime: imageMime,
    imageBase64: imageBase64,
    classification_override: classificationOverride,
  };

  // Support running a single node to inspect behavior in isolation
  let classified = null;
  let poiState = null;
  let next = null;
  if (singleNode && String(singleNode).toLowerCase() === 'classify') {
    classified = await classify_image(state);
    console.log('[NODE ONLY] classification result:', classified.classification);
    return { classified, poiState: null, next: 'NODE_ONLY' };
  }
  if (singleNode && String(singleNode).toLowerCase() === 'location') {
    classified = await classify_image(state);
    poiState = await location_intelligence_agent(classified);
    console.log('[NODE ONLY] location intel nearest_trail:', poiState.poiAnalysis?.nearest_trail);
    return { classified, poiState, next: 'NODE_ONLY' };
  }

  // Default flow: classify -> location -> route
  classified = await classify_image(state);
  poiState = await location_intelligence_agent(classified);
  next = route_after_location(poiState);

  console.log('[RESULT] classification:', classified.classification);
  console.log('[RESULT] poiAnalysis.nearest_trail:', poiState.poiAnalysis?.nearest_trail);
  console.log('[RESULT] next:', next);
  console.log('==== End of test: ', testName, '====\n');
  return { classified, poiState, next };
}

async function main() {
  // Simple CLI parsing to allow specifying an image and a single test to run
  const argv = process.argv.slice(2);
  const argMap = {};
  argv.forEach((arg) => {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      argMap[k] = v === undefined ? true : v;
    }
  });

  const testToRun = argMap.test || null; // e.g. --test=Receipt
  const imagePath = argMap.image || argMap.i || null; // e.g. --image=../jupyter/test.jpg
  const singleNode = argMap.node || null; // e.g. --node=location
  const verboseFlag = argMap.verbose || argMap.v || false;
  if (verboseFlag) process.env.ALLOW_DEV_DEBUG = 'true';

  const defaultTests = [
    { testName: 'Receipt', classificationOverride: 'receipt' },
    { testName: 'Scenery', classificationOverride: 'scenery' },
    { testName: 'Food', classificationOverride: 'food' },
    { testName: 'ReceiptWithGPS', classificationOverride: 'receipt', lat: 34.0522, lon: -118.2437 },
  ];

  if (testToRun) {
    // Run single test
    const found = defaultTests.find((t) => t.testName.toLowerCase() === String(testToRun).toLowerCase());
    if (!found) {
      console.warn('[DEBUG] Unknown test name:', testToRun);
      return;
    }
    await runFlow({ ...found, imagePath, singleNode });
    return;
  }

  // No test specified: run all tests using provided imagePath
  for (const t of defaultTests) {
    await runFlow({ ...t, imagePath, singleNode });
  }
}

main().catch((e)=>{
  console.error('Runner error', e);
  process.exit(1);
});
