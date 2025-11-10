const { StateGraph } = require('@langchain/langgraph');
const { AppState } = require('./state');
const logger = require('../../logger');

const {
  sceneryAgent,
  collectibleAgent,
  SCENERY_SYSTEM_PROMPT,
  COLLECTIBLE_SYSTEM_PROMPT,
  ROUTER_SYSTEM_PROMPT,
  ROUTER_MODEL,
  SCENERY_MODEL,
  COLLECTIBLE_MODEL,
} = require('../langchain/agents');
const { openai } = require('../openaiClient');
const { ChatOpenAI } = require('@langchain/openai');
const { PhotoPOIIdentifierNode } = require('../langchain/photoPOIIdentifier');
const { googleSearchTool } = require('../langchain/tools/searchTool');
const { buildPrompt, buildVisionContent } = require('../langchain/promptTemplate');
const { invokeAgentWithTools } = require('../langchain/graphHelpers');

const API_FLAVOR = process.env.USE_RESPONSES_API === 'true' ? 'responses' : 'chat';

function extractContent(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (Array.isArray(response.content)) {
    return response.content
      .map(part => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && typeof part.text === 'string') return part.text;
        if (typeof part === 'object' && typeof part.content === 'string') return part.content;
        return '';
      })
      .join('');
  }
  if (typeof response.content === 'string') {
    return response.content;
  }
  if (response.kwargs && response.kwargs.content !== undefined) {
    return extractContent({ content: response.kwargs.content });
  }
  if (typeof response.toString === 'function') {
    return String(response.toString());
  }
  return '';
}

function parseJsonFromContent(content) {
  if (!content) return null;
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function callRouter(state = {}) {
  logger.debug('[Graph] Node: callRouter');
  const stateKeys = state ? Object.keys(state) : [];
  const stateConstructor = state && state.constructor ? state.constructor.name : 'null';
  const hasImageBase64 = state
    ? Object.prototype.hasOwnProperty.call(state, 'imageBase64')
    : false;
  logger.info('[Graph Debug] Router state diagnostics:', {
    constructor: stateConstructor,
    hasImageBase64,
    keys: stateKeys,
    imageBase64Type: state ? typeof state.imageBase64 : 'undefined',
  });
  const {
    imageBase64,
    imageMime = 'image/jpeg',
    filename,
    device,
    gpsString,
    metadata,
    modelOverrides,
  } = state;
  const safeMetadata = metadata || {};
  const safeModelOverrides = modelOverrides || {};
  logger.debug(`[Graph] Router - imageMime: ${imageMime}, filename: ${filename}`);
  logger.info(`[Graph] Router - imageBase64 length: ${imageBase64 ? imageBase64.length : 'undefined'}`);
  logger.info(`[Graph] Router - First 50 chars: ${imageBase64 ? imageBase64.substring(0, 50) : 'N/A'}`);

  const locationPrompt = buildPrompt({
    dateTimeInfo: safeMetadata.DateTimeOriginal || safeMetadata.CreateDate || safeMetadata.ModifyDate || '',
    metadata: safeMetadata,
    device,
    gps: gpsString,
    locationAnalysis: null,
    poiAnalysis: null,
  });

  const dataUrl = `data:${imageMime};base64,${imageBase64}`;
  logger.info(`[Graph] Router - Data URL length: ${dataUrl.length}`);
  logger.info(`[Graph] Router - Data URL prefix: ${dataUrl.substring(0, 50)}`);
  
  const routerMessages = buildVisionContent(API_FLAVOR, {
    systemText: `${ROUTER_SYSTEM_PROMPT}\n\n${locationPrompt}`,
    userText: `Classify the image focal point. Filename: ${filename}`,
    imageUrlOrDataUrl: dataUrl,
    detail: 'high',
  });

  try {
    const routerModelToUse = safeModelOverrides.router || ROUTER_MODEL;
    // routerMessages is already in OpenAI format
    const response = await openai.chat.completions.create({
      model: routerModelToUse,
      messages: routerMessages,
      max_tokens: 512,
      temperature: 0.2,
    });
    // Native OpenAI SDK: response.choices[0].message.content
    const content = response.choices?.[0]?.message?.content || '';
    const parsed = parseJsonFromContent(content);

    let classification = parsed && typeof parsed.classification === 'string'
      ? parsed.classification
      : null;

    if (!classification && content) {
      const normalized = content.toLowerCase();
      if (normalized.includes('scenery_or_general_subject')) {
        classification = 'scenery_or_general_subject';
      } else if (normalized.includes('specific_identifiable_object')) {
        classification = 'specific_identifiable_object';
      }
    }

    logger.info('[Graph] Router classification:', classification);
    return { classification: classification || 'scenery_or_general_subject' };
  } catch (error) {
    logger.error('[Graph] Router failed:', error);
    return { error: 'Router agent failed', classification: 'scenery_or_general_subject' };
  }
}

async function callPoiIdentifier(state) {
  logger.debug('[Graph] Node: callPoiIdentifier');
  const { imageBase64, gpsString, metadata, filename } = state;

  if (!gpsString) {
    logger.info(`[Graph] Skipping POI lookup for ${filename} (no GPS)`);
    return { poiAnalysis: null };
  }

  try {
    const [lat, lon] = gpsString.split(',');
    const poiIdentifier = new PhotoPOIIdentifierNode(process.env.OPENAI_API_KEY);

    const poiAnalysis = await poiIdentifier.identifyPOI(
      imageBase64,
      parseFloat(lat),
      parseFloat(lon),
      metadata.DateTimeOriginal || metadata.CreateDate || metadata.ModifyDate || null
    );

    logger.info('--- POI IDENTIFIER OUTPUT ---');
    logger.info(JSON.stringify(poiAnalysis, null, 2));
    logger.info('-------------------------------');

    return { poiAnalysis };
  } catch (error) {
    logger.error('[Graph] POI Identifier failed:', error.message || error);
    return { error: 'POI Identifier failed', poiAnalysis: null };
  }
}

async function callFallbackSearch(state) {
  logger.debug('[Graph] Node: callFallbackSearch');
  const { poiAnalysis, gpsString } = state;

  try {
    const sceneAnalysis = poiAnalysis?.scene_analysis || {};
    const baseQuery = gpsString || '';
    const keywords = (sceneAnalysis.search_keywords || ['trail', 'open', 'space']).join(' ');
    const query = `${baseQuery} ${keywords} trail open space aqueduct`.trim();

    logger.info(`[Graph] Running fallback search with query: ${query}`);
    const searchRaw = await googleSearchTool.invoke({ query });
    const parsed = typeof searchRaw === 'string' ? parseJsonFromContent(searchRaw) : searchRaw;
    const results = parsed && Array.isArray(parsed.results) ? parsed.results : [];

    const rich_search_context = results
      .slice(0, 2)
      .map(result => result.snippet || '')
      .filter(Boolean)
      .join('; ');

    logger.info(`[Graph] Fallback search context: ${rich_search_context.slice(0, 100)}...`);
    return { rich_search_context: rich_search_context || null };
  } catch (error) {
    logger.error('[Graph] Fallback search failed:', error.message || error);
    return { error: 'Fallback search failed', rich_search_context: null };
  }
}

async function callNarrator(state = {}) {
  logger.debug('[Graph] Node: callNarrator');
  const {
    imageBase64,
    imageMime = 'image/jpeg',
    metadata,
    device,
    gpsString,
    poiAnalysis,
    rich_search_context,
    modelOverrides,
  } = state;
  const safeMetadata = metadata || {};
  const safeModelOverrides = modelOverrides || {};
  logger.debug(`[Graph] Narrator - imageMime: ${imageMime}`);

  const locationPrompt = buildPrompt({
    dateTimeInfo: safeMetadata.DateTimeOriginal || safeMetadata.CreateDate || safeMetadata.ModifyDate || '',
    metadata: safeMetadata,
    device,
    gps: gpsString,
    poiAnalysis,
    rich_search_context,
    bestMatchPOI: poiAnalysis?.best_match?.name || null,
    poiConfidence: poiAnalysis?.best_match?.confidence || null,
  });

  const agentMessages = [
    { role: 'system', content: `${SCENERY_SYSTEM_PROMPT}\n\n${locationPrompt}` },
    buildVisionContent(API_FLAVOR, {
      userText: 'Analyze the image and provide the final JSON output.',
      imageUrlOrDataUrl: `data:${imageMime};base64,${imageBase64}`,
      detail: 'high',
    }).pop(),
  ];

  try {
    const sceneryModelToUse = safeModelOverrides.scenery || SCENERY_MODEL;
    const localScenery = safeModelOverrides.scenery
      ? new ChatOpenAI({ modelName: sceneryModelToUse, temperature: 0.3, maxTokens: 1024 })
      : sceneryAgent;

    const response = await localScenery.invoke(agentMessages);
    const content = extractContent(response);
    const finalResult = parseJsonFromContent(content) || null;

    return { finalResult };
  } catch (error) {
    logger.error('[Graph] Narrator agent failed:', error);
    return { error: 'Narrator agent failed', finalResult: null };
  }
}

async function callCollectible(state = {}) {
  logger.debug('[Graph] Node: callCollectible');
  const {
    imageBase64,
    imageMime = 'image/jpeg',
    metadata,
    device,
    gpsString,
    modelOverrides,
  } = state;
  const safeMetadata = metadata || {};
  const safeModelOverrides = modelOverrides || {};
  logger.debug(`[Graph] Collectible - imageMime: ${imageMime}`);

  const locationPrompt = buildPrompt({
    dateTimeInfo: safeMetadata.DateTimeOriginal || safeMetadata.CreateDate || safeMetadata.ModifyDate || '',
    metadata: safeMetadata,
    device,
    gps: gpsString,
  });

  const agentMessages = [
    { role: 'system', content: `${COLLECTIBLE_SYSTEM_PROMPT}\n\n${locationPrompt}` },
    buildVisionContent(API_FLAVOR, {
      userText: 'Perform a high-resolution examination of the collectible.',
      imageUrlOrDataUrl: `data:${imageMime};base64,${imageBase64}`,
      detail: 'high',
    }).pop(),
  ];

  try {
    const collectibleModelToUse = safeModelOverrides.collectible || COLLECTIBLE_MODEL;
    const localCollectible = safeModelOverrides.collectible
      ? new ChatOpenAI({ modelName: collectibleModelToUse, temperature: 0.25, maxTokens: 1400 }).bindTools([googleSearchTool])
      : collectibleAgent;

    const response = await invokeAgentWithTools(localCollectible, agentMessages, [googleSearchTool]);
    const content = extractContent(response);
    const finalResult = parseJsonFromContent(content) || null;

    return { finalResult };
  } catch (error) {
    logger.error('[Graph] Collectible agent failed:', error);
    return { error: 'Collectible agent failed', finalResult: null };
  }
}

function routeByClassification(state) {
  logger.debug(`[Graph] Routing by classification: ${state.classification}`);
  if (state.classification === 'specific_identifiable_object') {
    return 'collectible_agent';
  }
  return 'poi_identifier';
}

function shouldRunFallbackSearch(state) {
  const { poiAnalysis } = state;
  const bestMatch = poiAnalysis?.best_match;
  const isNaturalScene = poiAnalysis?.scene_type === 'natural_landmark';

  if (isNaturalScene && (!bestMatch || bestMatch.confidence === 'low')) {
    logger.debug('[Graph] Routing to fallback search');
    return 'fallback_search';
  }
  logger.debug('[Graph] Skipping fallback search, routing to narrator');
  return 'narrator';
}

const workflow = new StateGraph({ state: AppState });

workflow.addNode('router', callRouter);
workflow.addNode('poi_identifier', callPoiIdentifier);
workflow.addNode('fallback_search', callFallbackSearch);
workflow.addNode('narrator', callNarrator);
workflow.addNode('collectible_agent', callCollectible);

workflow.setEntryPoint('router');

workflow.addConditionalEdges(
  'router',
  routeByClassification,
  {
    poi_identifier: 'poi_identifier',
    collectible_agent: 'collectible_agent',
  }
);

workflow.addConditionalEdges(
  'poi_identifier',
  shouldRunFallbackSearch,
  {
    fallback_search: 'fallback_search',
    narrator: 'narrator',
  }
);

workflow.addEdge('fallback_search', 'narrator');
workflow.addEdge('narrator', '__end__');
workflow.addEdge('collectible_agent', '__end__');

const app = workflow.compile();

module.exports = { app };
