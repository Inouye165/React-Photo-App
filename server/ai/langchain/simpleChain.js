// Minimal, dependency-free 'chain' scaffold to simulate a LangChain-style pipeline.
// Designed to be small and easy to replace with the real LangChain SDK later.
const { extractExif } = require('./exifTool');
const { geolocate } = require('./geolocateTool');
const { locationDetectiveTool } = require('./locationDetective');
const { buildPrompt } = require('./promptTemplate');
const { convertHeicToJpegBuffer } = require('../../media/image');
const fs = require('fs');
const path = require('path');

/**
 * A single 'tool' is a function accepting an input object and returning an
 * augmented context. Each tool must be small and focused.
 */
async function exifTool(ctx) {
  if (!ctx.metadata || Object.keys(ctx.metadata).length === 0) {
    try { ctx.metadata = (await extractExif(ctx.filePath)) || {}; } catch { ctx.metadata = {}; }
  }
  return ctx;
}

async function geolocateTool(ctx) {
  if (!ctx.gps && ctx.metadata && ctx.metadata.GPSLatitude && ctx.metadata.GPSLongitude) {
    ctx.gps = `${ctx.metadata.GPSLatitude},${ctx.metadata.GPSLongitude}`;
  }
  if (ctx.gps) {
    try { ctx.geoContext = await geolocate({ gpsString: ctx.gps, radiusFeet: 50, userAgent: process.env.NOMINATIM_USER_AGENT }); } catch { ctx.geoContext = null; }
  }
  return ctx;
}

async function locationDetectiveTool(ctx) {
  try {
    // Use the LangChain tool if available, otherwise fallback to basic analysis
    if (typeof locationDetectiveTool !== 'undefined' && locationDetectiveTool.invoke) {
      const result = await locationDetectiveTool.invoke({
        gpsString: ctx.gps,
        dateTimeInfo: ctx.dateTimeInfo,
        description: '',
        keywords: '',
        geoContext: ctx.geoContext
      });
      ctx.locationAnalysis = JSON.parse(result);
    } else {
      // Fallback basic location analysis
      ctx.locationAnalysis = null;
    }
  } catch {
    ctx.locationAnalysis = null;
  }
  return ctx;
}

async function promptTool(ctx) {
  ctx.prompt = buildPrompt({ dateTimeInfo: ctx.dateTimeInfo || '', metadata: ctx.metadata, device: ctx.device, gps: ctx.gps, geoContext: ctx.geoContext, locationAnalysis: ctx.locationAnalysis });
  return ctx;
}

async function imageEmbedTool(ctx) {
  const ext = path.extname(ctx.filePath).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    ctx.imageBuffer = await convertHeicToJpegBuffer(ctx.filePath, 90);
    ctx.imageMime = 'image/jpeg';
  } else {
    ctx.imageBuffer = fs.readFileSync(ctx.filePath);
    ctx.imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
  }
  ctx.imageDataUri = `data:${ctx.imageMime};base64,${ctx.imageBuffer.toString('base64')}`;
  return ctx;
}

/**
 * runSimpleChain: runs a curated list of tools to produce a messages object
 * that can be consumed by the adapter. It returns an object similar to the
 * previous OpenAI response shape but leaves the actual LLM call to the
 * adapter. This keeps parsing logic unchanged in `service.js`.
 */
async function runSimpleChain({ filePath, metadata = {}, gps = '', device = '' }) {
  const ctx = { filePath, metadata, gps, device, dateTimeInfo: '' };
  console.log('[SIMPLE_CHAIN] starting for', filePath);
  // attempt to parse date from metadata if present
  if (ctx.metadata) {
    const dateOriginal = ctx.metadata.DateTimeOriginal || ctx.metadata.CreateDate || ctx.metadata.DateTime;
    if (dateOriginal) {
      try { ctx.dateTimeInfo = new Date(dateOriginal).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); } catch { ctx.dateTimeInfo = dateOriginal; }
    }
  }

  // Run tools in order
  await exifTool(ctx);
  await geolocateTool(ctx);
  await locationDetectiveTool(ctx);
  await promptTool(ctx);
  await imageEmbedTool(ctx);

  // Build messages in the same shape used by service.js so the adapter can
  // either call OpenAI directly or call another LLM interface.
  const messages = [
    { role: 'user', content: [ { type: 'text', text: ctx.prompt }, { type: 'image_url', image_url: { url: ctx.imageDataUri } } ] }
  ];

  return { messages, ctx };
}

module.exports = { runSimpleChain };
