const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { routerAgent, sceneryAgent, researchAgent } = require('./langchain/agents');
const { googleSearchTool } = require('./langchain/tools/searchTool');
const { convertHeicToJpegBuffer } = require('../media/image');
const supabase = require('../lib/supabaseClient');

// Helper function to convert DMS (degrees, minutes, seconds) to decimal degrees
function dmsToDecimal(degrees, minutes = 0, seconds = 0) {
  return degrees + (minutes / 60) + (seconds / 3600);
}

// Helper: Generate caption, description, keywords for a photo using OpenAI Vision
async function processPhotoAI({ fileBuffer, filename, metadata, gps, device }) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in .env');


  // Convert image buffer to base64 and create data URI
  // Use imageBuffer/imageMime/imageBase64/imageDataUri only once in the function
  let imageBuffer, imageMime;
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    imageBuffer = await convertHeicToJpegBuffer(fileBuffer, 90);
    imageMime = 'image/jpeg';
  } else {
    imageBuffer = fileBuffer;
    imageMime = ext === '.png' ? 'image/png' : 'image/jpeg';
  }
  const imageBase64 = imageBuffer.toString('base64');
  const imageDataUri = `data:${imageMime};base64,${imageBase64}`;

  // Step 1: Route/classify the image
  const routerMessages = [
    { role: 'user', content: [
      { type: 'text', text: `Classify the image focal point as scenery_or_general_subject or specific_identifiable_object. Filename: ${filename}, Device: ${device}, GPS: ${gps}` },
      { type: 'image_url', image_url: { url: imageDataUri } }
    ]}
  ];
  let routerResult;
  try {
    routerResult = await routerAgent.invoke(routerMessages);
    console.log('[AI Router] Output:', JSON.stringify(routerResult, null, 2));
  } catch (err) {
    console.error('[AI Router] Failed:', err);
    throw err;
  }
  // Extract classification from routerAgent output
  let classification;
  if (routerResult.classification) {
    classification = routerResult.classification;
  } else {
    // Fallback: search the entire serialized routerResult for classification keywords
    const routerText = JSON.stringify(routerResult || {}).toLowerCase();
    if (routerText.includes('scenery_or_general_subject') || routerText.includes('scenery or general subject')) {
      classification = 'scenery_or_general_subject';
    } else if (routerText.includes('specific_identifiable_object') || routerText.includes('specific identifiable object')) {
      classification = 'specific_identifiable_object';
    }
    if (!classification) {
      console.error('[AI Router] Could not extract classification from routerResult:', JSON.stringify(routerResult, null, 2));
    }
  }

  // Step 2: Run the appropriate agent
  let agentResult;
  const agentMessages = [
    { role: 'user', content: [
      { type: 'text', text: `Analyze the image. Filename: ${filename}, Device: ${device}, GPS: ${gps}` },
      { type: 'image_url', image_url: { url: imageDataUri } }
    ]}
  ];
  if (classification === 'scenery_or_general_subject') {
    try {
      agentResult = await sceneryAgent.invoke(agentMessages);
    } catch (err) {
      console.error('[AI SceneryAgent] Failed:', err);
      throw err;
    }
  } else if (classification === 'specific_identifiable_object') {
    try {
      agentResult = await researchAgent.invoke(agentMessages);
    } catch (err) {
      console.error('[AI ResearchAgent] Failed:', err);
      throw err;
    }
  } else {
    throw new Error('Unknown classification from routerAgent: ' + classification);
  }

  // Step 3: Normalize/parse the agent's output into the expected shape
  // Expected shape: { caption: string, description: string, keywords: string, poiAnalysis?: object }
  let result = { caption: '', description: '', keywords: '' };
  try {
    // LangChain AIMessage shape: { lc: 1, type: 'constructor', kwargs: { content: '...' } }
    let content = null;
    if (agentResult && agentResult.kwargs && typeof agentResult.kwargs.content === 'string') {
      content = agentResult.kwargs.content;
    } else if (typeof agentResult === 'string') {
      content = agentResult;
    } else if (agentResult && agentResult.content && typeof agentResult.content === 'string') {
      content = agentResult.content;
    }

    if (content) {
      // Try to parse JSON first
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          result.caption = String(parsed.caption || parsed.title || parsed.headline || '')
            .trim();
          result.description = String(parsed.description || parsed.body || parsed.text || parsed.summary || '')
            .trim();
          if (parsed.keywords) {
            if (Array.isArray(parsed.keywords)) result.keywords = parsed.keywords.join(', ');
            else result.keywords = String(parsed.keywords).trim();
          }
          // attach poiAnalysis if present
          if (parsed.poiAnalysis) result.poiAnalysis = parsed.poiAnalysis;
        } else {
          // fallback to using entire content as description
          result.description = String(content).trim();
        }
      } catch {
        // not JSON — place raw content into description
        result.description = String(content).trim();
      }
    } else {
      // No content found — try to inspect the agentResult object for text
      result.description = JSON.stringify(agentResult).slice(0, 2000);
    }
  } catch (err) {
    console.error('[AI Parser] Failed to normalize agentResult:', err);
    result.description = typeof agentResult === 'string' ? agentResult : JSON.stringify(agentResult);
  }

  console.log('[AI Result] caption:', result.caption);
  console.log('[AI Result] description (truncated):', (result.description || '').slice(0, 300));
  console.log('[AI Result] keywords:', result.keywords);

  return result;
}

// Helper: Update photo AI metadata in DB with retry logic
async function updatePhotoAIMetadata(db, photoRow, storagePath) {
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
      // Download file from Supabase Storage
      const { data: fileData, error } = await supabase.storage
        .from('photos')
        .download(storagePath);
      
      if (error) {
        throw new Error(`Failed to download file from storage: ${error.message}`);
      }
      
      const fileBuffer = await fileData.arrayBuffer();
      
      ai = await processPhotoAI({ 
        fileBuffer: Buffer.from(fileBuffer), 
        filename: photoRow.filename, 
        metadata: meta, 
        gps, 
        device 
      });
    } catch (error) {
      console.error(`AI processing failed for ${photoRow.filename} (attempt ${retryCount + 1}):`, error.message || error);
      await db('photos').where({ id: photoRow.id }).update({ ai_retry_count: retryCount + 1 });
      return null;
    }
      console.log('[AI Update] Retrieved AI result for', photoRow.filename, JSON.stringify({
        caption: ai && ai.caption,
        description: ai && (ai.description || '').slice(0,200),
        keywords: ai && ai.keywords
      }));

      // Ensure non-null strings for DB and provide fallbacks when AI doesn't return a caption or keywords
      const description = ai && ai.description ? String(ai.description).trim() : 'AI processing failed';

      // Generate a short caption fallback from the first sentence of the description if caption missing
      const generateCaptionFallback = (desc) => {
        if (!desc) return 'AI processing failed';
    const firstSentence = desc.split(/[.\n]/)[0] || desc;
        const words = firstSentence.trim().split(/\s+/).slice(0, 10);
        return words.join(' ').replace(/[,:;]$/,'');
      };

      const caption = (ai && ai.caption && String(ai.caption).trim())
        ? String(ai.caption).trim()
        : generateCaptionFallback(description);

      // Simple keywords extractor: pick frequent non-stopwords from the description
      const generateKeywordsFallback = (desc) => {
        if (!desc) return '';
    const stopwords = new Set(['the','and','a','an','in','on','with','of','is','are','to','for','it','this','that','as','by','from','at','be','has','have','was','were','or','but','its','their','they','image','images','shows','show']);
        const words = desc.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
        const freq = {};
        for (const w of words) freq[w] = (freq[w] || 0) + 1;
        const items = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,5).map(x => x[0]);
        return items.join(', ');
      };

      const keywords = (ai && ai.keywords && String(ai.keywords).trim())
        ? String(ai.keywords).trim()
        : generateKeywordsFallback(description);

      await db('photos').where({ id: photoRow.id }).update({
        caption,
        description,
        keywords,
        ai_retry_count: 0,
        poi_analysis: JSON.stringify((ai && ai.poiAnalysis) || null)
      });

      // Fetch saved row to confirm
      const saved = await db('photos').where({ id: photoRow.id }).first();
      console.log('[AI Update] Saved DB values:', {
        caption: saved.caption,
        description: (saved.description || '').slice(0,200),
        keywords: saved.keywords
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
async function processAllUnprocessedInprogress(db) {
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
      
      const storagePath = row.storage_path || `${row.state}/${row.filename}`;
      console.log(`[RECHECK] Processing AI metadata for ${row.filename} at ${storagePath}`);
      await updatePhotoAIMetadata(db, row, storagePath);
    }
    return rows.length;
  } catch (error) {
    console.error('[RECHECK] Error processing unprocessed inprogress files:', error);
    throw error;
  }
}

module.exports = { processPhotoAI, updatePhotoAIMetadata, isAIFailed, processAllUnprocessedInprogress };