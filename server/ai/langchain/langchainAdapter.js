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
  const { photoPOIIdentifierTool } = require('./photoPOIIdentifier');
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
      console.log('GPS conversion: Raw GPSLatitude:', ctx.metadata.GPSLatitude, 'GPSLongitude:', ctx.metadata.GPSLongitude);
      // Convert DMS arrays to decimal degrees
      const latDMS = Array.isArray(ctx.metadata.GPSLatitude) ? ctx.metadata.GPSLatitude : [ctx.metadata.GPSLatitude];
      const lonDMS = Array.isArray(ctx.metadata.GPSLongitude) ? ctx.metadata.GPSLongitude : [ctx.metadata.GPSLongitude];

      const latDecimal = latDMS[0] + (latDMS[1] || 0) / 60 + (latDMS[2] || 0) / 3600;
      const lonDecimal = lonDMS[0] + (lonDMS[1] || 0) / 60 + (lonDMS[2] || 0) / 3600;

      // Apply hemisphere signs
      const latSign = ctx.metadata.GPSLatitudeRef === 'S' ? -1 : 1;
      const lonSign = ctx.metadata.GPSLongitudeRef === 'W' ? -1 : 1;

      ctx.gps = `${latDecimal * latSign},${lonDecimal * lonSign}`;
      console.log('GPS conversion: Converted to decimal degrees:', ctx.gps);
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

    // Advanced POI identification
    try {
      // Prepare image data for POI identifier
      let imageData = '';
      try {
        const ext = path.extname(filePath || '').toLowerCase();
        let imageBuffer;
        if (ext === '.heic' || ext === '.heif') {
          imageBuffer = await convertHeicToJpegBuffer(filePath, 90);
        } else if (filePath && fs.existsSync(filePath)) {
          imageBuffer = fs.readFileSync(filePath);
        }
        if (imageBuffer) imageData = imageBuffer.toString('base64');
      } catch {
        imageData = '';
      }

      if (imageData && ctx.gps) {
        const [latitude, longitude] = ctx.gps.split(',').map(coord => coord.trim());
        console.log('POI identification: GPS coordinates:', ctx.gps, 'parsed as lat:', latitude, 'lng:', longitude);
        const poiResult = await photoPOIIdentifierTool.invoke({
          imageData,
          latitude,
          longitude,
          timestamp: ctx.dateTimeInfo
        });
        ctx.poiAnalysis = JSON.parse(poiResult);
        console.log('POI identification successful');
        console.log('POI analysis result:', JSON.stringify(ctx.poiAnalysis, null, 2));
      } else {
        console.log('POI identification skipped: missing imageData or GPS');
      }
    } catch (error) {
      console.error('POI identification failed:', error.message || error);
      ctx.poiAnalysis = null;
    }

    // Build prompt
    const promptText = buildPrompt({
      dateTimeInfo: ctx.dateTimeInfo || '',
      metadata: ctx.metadata,
      device: ctx.device,
      gps: ctx.gps,
      geoContext: ctx.geoContext,
      locationAnalysis: ctx.locationAnalysis,
      poiAnalysis: ctx.poiAnalysis
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
      timeout: 30000, // 30 second timeout
      maxRetries: 2
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
