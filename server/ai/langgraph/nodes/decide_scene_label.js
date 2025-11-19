const { DECIDE_SCENE_SYSTEM_PROMPT, DECIDE_SCENE_USER_PROMPT } = require('../../prompts/decide_scene_label');
const { openai } = require('../../openaiClient');
const logger = require('../../../logger');
const { extractUsageFromResponse, accumulateDebugUsage } = require('../utils');

async function decide_scene_label(state) {
  let debugUsage = state.debugUsage;
  try {
    const systemPrompt = DECIDE_SCENE_SYSTEM_PROMPT;
    const userPrompt = DECIDE_SCENE_USER_PROMPT;

    const userContent = [
      { type: 'text', text: userPrompt },
      { type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'low' } },
    ];

    const configuredModel = state.modelOverrides?.defaultModel || 'gpt-4o';
    let tags = [];
    try {
      const response = await openai.chat.completions.create({
        model: configuredModel,
        messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userContent } ],
        max_tokens: 128,
        response_format: { type: 'json_object' },
      });

      const raw = response?.choices?.[0]?.message?.content || '{}';
      try {
        const parsed = JSON.parse(raw);
        tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).toLowerCase()) : [];
      } catch {
        tags = [];
      }
      const durationMs = 0;
      const { usage, model } = extractUsageFromResponse(response);
      debugUsage = accumulateDebugUsage(debugUsage, {
        step: 'decide_scene_label_tagging',
        model: model || configuredModel,
        usage,
        durationMs,
        notes: 'Image tag extraction',
        request: { systemPrompt, userPrompt },
        response: raw,
        prompt: userPrompt,
      });
    } catch {
      tags = [];
    }

    const categoryPriority = ['attraction', 'park', 'trail', 'hotel', 'restaurant'];
    const nearby = Array.isArray(state.poiAnalysis?.nearbyPOIs) ? state.poiAnalysis.nearbyPOIs : [];
    let poiCandidate = null;
    for (const category of categoryPriority) {
      const match = nearby.find((place) => (place?.category || '').toLowerCase() === category);
      if (match) {
        poiCandidate = match;
        break;
      }
    }
    if (!poiCandidate && state.poiAnalysis?.bestMatchPOI) {
      poiCandidate = state.poiAnalysis.bestMatchPOI;
    }

    const chosenLabelFallback = state.poiAnalysis?.address || null;
    let chosenLabel = null;
    let rationale = '';
    let confidence = 'low';

    if (poiCandidate && poiCandidate.name) {
      const category = (poiCandidate.category || 'location').toLowerCase();
      const categoryIndex = categoryPriority.indexOf(category);
      const tagSnippet = tags.slice(0, 3).join(', ') || 'general scene tags';
      chosenLabel = poiCandidate.name;
      rationale = `Nearest ${category} matches scene tags (${tagSnippet}).`;
      if (categoryIndex === 0) {
        confidence = 'high';
      } else if (categoryIndex >= 1 && categoryIndex <= 2) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }
    } else if (chosenLabelFallback) {
      chosenLabel = chosenLabelFallback;
      rationale = 'No POI match; using reverse geocode address.';
      confidence = 'low';
    }

    const sceneDecision = chosenLabel ? { chosenLabel, rationale, confidence } : null;

    debugUsage = accumulateDebugUsage(debugUsage, {
      step: 'decide_scene_label',
      model: null,
      usage: null,
      durationMs: 0,
      notes: 'Scene label decision based on POI and tags',
      request: { systemPrompt: null, userPrompt: `Tags: ${tags.join(',')}` },
      response: sceneDecision,
      prompt: `Tags: ${tags.join(',')}`,
    });

    return { ...state, sceneDecision, debugUsage };
  } catch (err) {
    logger.warn('[LangGraph] decide_scene_label failed', err && err.message ? err.message : err);
    return { ...state, sceneDecision: null, debugUsage };
  }
}

module.exports = decide_scene_label;