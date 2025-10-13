// LangChain-backed adapter: runs a tool-based pipeline and invokes LangChain's ChatOpenAI with vision.
// This file is guarded so missing LangChain won't break the app.
try {
  const fs = require('fs');
  const path = require('path');
  const { ChatOpenAI } = require('@langchain/openai');
  const { HumanMessage } = require('@langchain/core/messages');
  const { exifTool } = require('./exifTool');
  const { geolocateTool } = require('./geolocateTool');
  const { locationDetectiveTool } = require('./locationDetective');
  const { buildPrompt } = require('./promptTemplate');
  const { convertHeicToJpegBuffer } = require('../../media/image');

  async function runLangChain({ messages: _messages, model = 'gpt-4o', max_tokens = 1500, temperature = 0.25, filePath, metadata = {}, gps = '', device = '' }) {
    const ctx = { filePath, metadata, gps, device, method: 'langchain' };

    // Call EXIF tool
    let exifResult;
    try {
      exifResult = await exifTool.invoke({ filePath });
      ctx.metadata = JSON.parse(exifResult) || {};
    } catch {
      ctx.metadata = {};
    }

    // Date/time formatting
    if (ctx.metadata) {
      const dateOriginal = ctx.metadata.DateTimeOriginal || ctx.metadata.CreateDate || ctx.metadata.DateTime;
      if (dateOriginal) {
        try {
          ctx.dateTimeInfo = new Date(dateOriginal).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        } catch {
          ctx.dateTimeInfo = dateOriginal;
        }
      }
    }

    // GPS / geolocation
    if (!ctx.gps && ctx.metadata && ctx.metadata.GPSLatitude && ctx.metadata.GPSLongitude) {
      ctx.gps = `${ctx.metadata.GPSLatitude},${ctx.metadata.GPSLongitude}`;
    }
    if (ctx.gps) {
      try {
        const geoResult = await geolocateTool.invoke({
          gpsString: ctx.gps,
          radiusFeet: 50,
          userAgent: process.env.NOMINATIM_USER_AGENT
        });
        ctx.geoContext = JSON.parse(geoResult);
      } catch {
        ctx.geoContext = null;
      }
    }

    // Location detective analysis
    try {
      const detectiveResult = await locationDetectiveTool.invoke({
        gpsString: ctx.gps,
        dateTimeInfo: ctx.dateTimeInfo,
        description: '', // Will be filled by AI
        keywords: '', // Will be filled by AI
        geoContext: ctx.geoContext
      });
      ctx.locationAnalysis = JSON.parse(detectiveResult);
    } catch {
      ctx.locationAnalysis = null;
    }

    // Build prompt
    const promptText = buildPrompt({
      dateTimeInfo: ctx.dateTimeInfo || '',
      metadata: ctx.metadata,
      device: ctx.device,
      gps: ctx.gps,
      geoContext: ctx.geoContext,
      locationAnalysis: ctx.locationAnalysis
    });

    // Prepare image
    let imageDataUri = '';
    try {
      const ext = path.extname(filePath || '').toLowerCase();
      let imageBuffer;
      let imageMime = 'image/jpeg';
      if (ext === '.heic' || ext === '.heif') {
        imageBuffer = await convertHeicToJpegBuffer(filePath, 90);
        imageMime = 'image/jpeg';
      } else if (filePath && fs.existsSync(filePath)) {
        imageBuffer = fs.readFileSync(filePath);
        imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
      }
      if (imageBuffer) imageDataUri = `data:${imageMime};base64,${imageBuffer.toString('base64')}`;
    } catch {
      imageDataUri = '';
    }

    // Use ChatOpenAI with vision
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: model,
      maxTokens: max_tokens,
      temperature,
    });

    const message = new HumanMessage({
      content: [
        { type: 'text', text: promptText },
        imageDataUri ? { type: 'image_url', image_url: { url: imageDataUri } } : { type: 'text', text: '[No image available]' },
      ],
    });

    const response = await llm.invoke([message]);

    // Return OpenAI-like shape and attach context
    const out = {
      choices: [{ message: { content: response.content } }],
      _ctx: ctx
    };
    return out;
  }

  module.exports = { runLangChain };
} catch (e) {
  module.exports = {
    runLangChain: async () => { throw new Error('LangChain integration not available: ' + (e && e.message)); }
  };
}
