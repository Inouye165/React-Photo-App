const { GENERATE_METADATA_SYSTEM_PROMPT, GENERATE_METADATA_USER_PROMPT } = require('../../prompts/generate_metadata');
const { openai } = require('../../openaiClient');
const logger = require('../../../logger');
const { summarizeMetadataForPrompt, enrichMetadataWithPoi } = require('../utils');

async function generate_metadata(state) {
  try {
    logger.info('[LangGraph] generate_metadata node invoked (default/scenery)');
    const metadataForPrompt = summarizeMetadataForPrompt(state.metadata || {});
    let prompt = GENERATE_METADATA_USER_PROMPT;
    prompt = prompt
      .replace('{classification}', String(state.classification || ''))
      .replace('{metadataForPrompt}', JSON.stringify(metadataForPrompt || {}))
      .replace('{poiAnalysis}', JSON.stringify(state.poiAnalysis || {}))
      .replace('{sceneDecision}', JSON.stringify(state.sceneDecision || {}))
      .replace('{gps}', String(state.gpsString || ''))
      .replace('{device}', String(state.device || ''));

    const userContent = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${state.imageMime};base64,${state.imageBase64}`,
          detail: 'high',
        },
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: GENERATE_METADATA_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 512,
      response_format: { type: 'json_object' },
    });

    let parsed;
    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch (e) {
      logger.error('[LangGraph] generate_metadata: FAILED TO PARSE AGENT RESPONSE. This often means the agent returned a simple text fallback instead of JSON.', {
        error: e.message,
        raw_response: response.choices[0].message.content,
      });
      return { ...state, error: 'Failed to parse metadata response: ' + e.message };
    }
    logger.info('[LangGraph] generate_metadata: Model returned metadata');
    parsed.classification = state.classification;
    parsed = enrichMetadataWithPoi(parsed, state.poiAnalysis);
    return { ...state, finalResult: parsed, error: null };
  } catch (err) {
    logger.error('[LangGraph] generate_metadata: Error', err);
    return { ...state, error: err.message || String(err) };
  }
}

module.exports = generate_metadata;