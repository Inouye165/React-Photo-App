#!/usr/bin/env node
/*
  Step-through LangGraph debugger entrypoint.
  Emits one JSON object per line describing node steps and one final summary.
  Usage: node langgraph_step_debug.js --image=path/to/image.jpg [--verbose] [--max-steps=10]
*/
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (const a of args) {
    if (a.startsWith('--image=')) out.image = a.split('=')[1];
    else if (a === '--verbose') out.verbose = true;
    else if (a.startsWith('--max-steps=')) out.maxSteps = Number(a.split('=')[1]) || undefined;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function fileToBase64(filePath) {
  const buf = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'heic' || ext === 'heif' ? 'image/heic' : 'application/octet-stream';
  return { buffer: buf, base64: buf.toString('base64'), mime };
}

function timestamp() {
  return new Date().toISOString();
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node langgraph_step_debug.js --image=path --verbose --max-steps=10');
    process.exit(0);
  }
  if (!args.image) {
    console.error(JSON.stringify({ type: 'final', error: 'No --image provided' }));
    process.exit(2);
  }

  // repoRoot not used in this script; removed to satisfy lint
  const imagePath = path.resolve(args.image);
  if (!fs.existsSync(imagePath)) {
    console.error(JSON.stringify({ type: 'final', error: `Image not found: ${imagePath}` }));
    process.exit(2);
  }

  // Prepare initial state matching AppState
  const { buffer, base64, mime } = await fileToBase64(imagePath);
  const initialState = {
    filename: path.basename(imagePath),
    fileBuffer: buffer,
    imageBase64: base64,
    imageMime: mime,
    metadata: {},
    gpsString: null,
    device: null,
    modelOverrides: {},
    classification: null,
    poiAnalysis: null,
    rich_search_context: null,
    finalResult: null,
    error: null,
    sceneDecision: null,
    debugUsage: [],
  };

  // Capture logs
  const captured = {
    llmCalls: [],
    apiCalls: [],
  };

  // Monkey-patch OpenAI & POI modules to capture inputs/outputs
  try {
    const openaiModule = require(path.join(__dirname, '..', 'openaiClient'));
    if (openaiModule && openaiModule.openai && openaiModule.openai.chat && openaiModule.openai.chat.completions && typeof openaiModule.openai.chat.completions.create === 'function') {
      const originalCreate = openaiModule.openai.chat.completions.create.bind(openaiModule.openai.chat.completions);
      openaiModule.openai.chat.completions.create = async function patchedCreate(opts) {
        const stack = (new Error()).stack || '';
        let caller = 'unknown';
        try {
          const m = stack.split('\n').find(l => l.includes('graph.ts')) || stack.split('\n')[2] || '';
          const match = String(m).match(/at (.*?) \(/);
          if (match) caller = match[1];
        } catch (_) { void _; }
        const callRecord = { timestamp: timestamp(), caller, request: opts };
        let res;
        try {
          res = await originalCreate(opts);
          callRecord.response = res;
          // Try to capture usage safely
          try { callRecord.usage = res?.usage || null; } catch (_) { void _; callRecord.usage = null; }
        } catch (err) {
          callRecord.error = String(err && err.message ? err.message : err);
          throw err;
        } finally {
          captured.llmCalls.push(callRecord);
        }
        return res;
      };
    }
  } catch (_err) { void _err; /* ignore if openai client not available */ }

  // Wrap POI helpers
  try {
    const gp = require(path.join(__dirname, '..', 'poi', 'googlePlaces'));
    if (gp && typeof gp.reverseGeocode === 'function') {
      const orig = gp.reverseGeocode.bind(gp);
      gp.reverseGeocode = async function patchedReverse(lat, lon) {
        const entry = { timestamp: timestamp(), module: 'googlePlaces', fn: 'reverseGeocode', input: { lat, lon }};
        try { const r = await orig(lat, lon); entry.output = r; captured.apiCalls.push(entry); return r; } catch (e) { entry.error = String(e && e.message ? e.message : e); captured.apiCalls.push(entry); throw e; }
      };
    }
    if (gp && typeof gp.nearbyPlaces === 'function') {
      const orig2 = gp.nearbyPlaces.bind(gp);
      gp.nearbyPlaces = async function patchedNearby(lat, lon, radius) {
        const entry = { timestamp: timestamp(), module: 'googlePlaces', fn: 'nearbyPlaces', input: { lat, lon, radius }};
        try { const r = await orig2(lat, lon, radius); entry.output = (Array.isArray(r)?{ count: r.length, names: r.map(p=>p.name).slice(0,10)}:r); captured.apiCalls.push(entry); return r; } catch (e) { entry.error = String(e && e.message ? e.message : e); captured.apiCalls.push(entry); throw e; }
      };
    }
  } catch (_err) { void _err; }

  try {
    const osm = require(path.join(__dirname, '..', 'poi', 'osmTrails'));
    if (osm && typeof osm.nearbyTrailsFromOSM === 'function') {
      const orig = osm.nearbyTrailsFromOSM.bind(osm);
      osm.nearbyTrailsFromOSM = async function patchedOSM(lat, lon, radius) {
        const entry = { timestamp: timestamp(), module: 'osmTrails', fn: 'nearbyTrailsFromOSM', input: { lat, lon, radius }};
        try { const r = await orig(lat, lon, radius); entry.output = (Array.isArray(r)?{ count: r.length, names: r.map(t=>t.name).slice(0,10)}:r); captured.apiCalls.push(entry); return r; } catch (e) { entry.error = String(e && e.message ? e.message : e); captured.apiCalls.push(entry); throw e; }
      };
    }
  } catch (_err) { void _err; }

  try {
    const fp = require(path.join(__dirname, '..', 'poi', 'foodPlaces'));
    if (fp && typeof fp.nearbyFoodPlaces === 'function') {
      const orig = fp.nearbyFoodPlaces.bind(fp);
      fp.nearbyFoodPlaces = async function patchedFood(lat, lon, radius) {
        const entry = { timestamp: timestamp(), module: 'foodPlaces', fn: 'nearbyFoodPlaces', input: { lat, lon, radius }};
        try { const r = await orig(lat, lon, radius); entry.output = (Array.isArray(r)?{ count: r.length, names: r.map(p=>p.name).slice(0,10)}:r); captured.apiCalls.push(entry); return r; } catch (e) { entry.error = String(e && e.message ? e.message : e); captured.apiCalls.push(entry); throw e; }
      };
    }
  } catch (_err) { void _err; }

  // Load compiled LangGraph app
  let appModule;
  try {
    appModule = require(path.join(__dirname, 'graph.ts'));
  } catch (err) {
    console.error(JSON.stringify({ type: 'final', error: 'Failed to require graph.ts: ' + String(err && err.message ? err.message : err) }));
    process.exit(3);
  }

  const app = appModule && appModule.app;
  if (!app) {
    console.error(JSON.stringify({ type: 'final', error: 'graph.ts did not export compiled app' }));
    process.exit(3);
  }

  // Try common run methods
  const runMethods = ['run', 'execute', 'start', 'invoke', 'call'];
  let runFn = null;
  for (const m of runMethods) {
    if (typeof app[m] === 'function') { runFn = app[m].bind(app); break; }
  }

  // If no runFn, attempt to call compiled object's default (if it's a function)
  if (!runFn && typeof app === 'function') runFn = app;

  if (!runFn) {
    // As a last resort, try looking for a 'workflow' property that has 'run'
    if (app && typeof app.run === 'function') runFn = app.run.bind(app);
  }

  if (!runFn) {
    console.error(JSON.stringify({ type: 'final', error: 'Compiled graph has no runnable method (tried run/execute/start/invoke)' }));
    process.exit(4);
  }

  // Execute the graph
  let finalState = null;
  try {
    // Some compiled DSLs accept (initialState, { debug: true }) — pass nothing extra to avoid changing behavior
    const result = await runFn(initialState);
    finalState = result || initialState;
  } catch (err) {
    // If run failed, attempt to inspect state from thrown object or the error message
    console.error(JSON.stringify({ type: 'final', error: 'Graph execution failed: ' + String(err && err.message ? err.message : err) }));
    process.exit(5);
  }

  // Build ordered steps from captured data and finalState
  const knownOrder = ['classify_image','collect_context','location_intelligence_agent','decide_scene_label','generate_metadata','handle_collectible','food_location_agent','food_metadata_agent'];
  const steps = [];

  for (const nodeName of knownOrder) {
    // Determine if this node produced any captured items
    const llms = captured.llmCalls.filter(c => String(c.caller || '').toLowerCase().includes(nodeName.replace(/_/g,'')) || String(c.caller || '').toLowerCase().includes(nodeName));
    const apis = captured.apiCalls.filter(a => (a.module && (a.module.toLowerCase().includes(nodeName.replace(/_/g,'')) || nodeName.includes(a.module))));

    // Partial input summary
    const inputSummary = {
      filename: initialState.filename,
      gpsString: initialState.gpsString || finalState.gpsString || (finalState.poiAnalysis && finalState.poiAnalysis.gpsString) || null,
      classification_before: null,
    };
    // classification before: not precise — use initial state's classification (null) or final state's if set early
    inputSummary.classification_before = initialState.classification || null;

    const outputSummary = {};
    if (nodeName === 'classify_image') outputSummary.classification = finalState.classification || null;
    if (nodeName === 'location_intelligence_agent') outputSummary.poiAnalysis = finalState.poiAnalysis || null;
    if (nodeName === 'decide_scene_label') outputSummary.sceneDecision = finalState.sceneDecision || null;
    if (nodeName === 'generate_metadata') outputSummary.finalResult = finalState.finalResult || null;
    if (nodeName === 'handle_collectible') outputSummary.finalResult = finalState.finalResult || null;
    if (nodeName === 'food_location_agent') outputSummary.nearby_food_places = finalState.nearby_food_places || null;
    if (nodeName === 'food_metadata_agent') outputSummary.finalResult = finalState.finalResult || null;

    // Only emit if we have something to show
    const hasActivity = (llms && llms.length) || (apis && apis.length) || Object.keys(outputSummary).some(k => outputSummary[k] != null);
    if (!hasActivity) continue;

    const step = {
      type: 'step',
      stepIndex: steps.length,
      nodeName,
      timestamp: timestamp(),
      input: inputSummary,
      output: outputSummary,
      llm: llms.map(c => ({ timestamp: c.timestamp, caller: c.caller, request: safeSerialize(c.request), rawResponse: safeSerialize(c.response), usage: c.usage || null })),
      apis: apis.map(a => ({ timestamp: a.timestamp, module: a.module, fn: a.fn, input: a.input, resultSummary: a.output || null, error: a.error || null })),
    };
    console.log(JSON.stringify(step));
    steps.push(step);
    if (args.maxSteps && steps.length >= args.maxSteps) break;
  }

  // Emit final summary
  const finalObj = {
    type: 'final',
    finalState: safeSerialize(finalState),
    steps: steps.length,
    capturedCounts: { llmCalls: captured.llmCalls.length, apiCalls: captured.apiCalls.length },
    error: finalState && finalState.error ? finalState.error : null,
  };
  console.log(JSON.stringify(finalObj));
  process.exit(0);
}

function safeSerialize(obj) {
  try {
    return JSON.parse(JSON.stringify(obj, replacer, 2));
  } catch (e) {
    void e;
    try {
      return String(obj);
    } catch {
      return null;
    }
  }
}

function replacer(key, value) {
  // Avoid embedding huge base64 or buffers
  if (key && (key.toLowerCase().includes('base64') || key.toLowerCase().includes('filebuffer') || key === 'fileBuffer')) return '[omitted]';
  if (value && value instanceof Buffer) return '[Buffer]';
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  return value;
}

main().catch(err => {
  console.error(JSON.stringify({ type: 'final', error: String(err && err.message ? err.message : err) }));
  process.exit(1);
});
