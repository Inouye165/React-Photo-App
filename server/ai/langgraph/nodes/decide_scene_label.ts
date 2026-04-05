const { DECIDE_SCENE_SYSTEM_PROMPT, DECIDE_SCENE_USER_PROMPT } = require('../../prompts/decide_scene_label');
const { openai } = require('../../openaiClient');
const logger = require('../../../logger');
const { extractUsageFromResponse, accumulateDebugUsage } = require('../utils');

interface SceneDecision {
  chosenLabel: string;
  rationale: string;
  confidence: string;
}

interface NearbyPOI {
  name?: string;
  category?: string;
}

async function decide_scene_label(state: Record<string, any>): Promise<Record<string, any>> {
  let debugUsage = state.debugUsage;
  try {
    const systemPrompt: string = DECIDE_SCENE_SYSTEM_PROMPT;
    const userPrompt: string = DECIDE_SCENE_USER_PROMPT;

    const userContent = [
      { type: 'text', text: userPrompt },
      { type: 'image_url', image_url: { url: `data:${state.imageMime};base64,${state.imageBase64}`, detail: 'low' } },
    ];

    const configuredModel: string = state.modelOverrides?.defaultModel || 'gpt-4o';
    let tags: string[] = [];
    try {
      const response = await openai.chat.completions.create({
        model: configuredModel,
        messages: [ { role: 'system', content: systemPrompt }, { role: 'user', content: userContent } ],
        max_tokens: 128,
        response_format: { type: 'json_object' },
      });

      const raw: string = response?.choices?.[0]?.message?.content || '{}';
      try {
        const parsed = JSON.parse(raw);
        tags = Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t).toLowerCase()) : [];
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

    const categoryPriority: string[] = ['attraction', 'park', 'trail', 'hotel', 'restaurant'];
    const nearby: NearbyPOI[] = Array.isArray(state.poiAnalysis?.nearbyPOIs) ? state.poiAnalysis.nearbyPOIs : [];
    let poiCandidate: NearbyPOI | null = null;
    for (const category of categoryPriority) {
      const match = nearby.find((place: NearbyPOI) => (place?.category || '').toLowerCase() === category);
      if (match) {
        poiCandidate = match;
        break;
      }
    }
    if (!poiCandidate && state.poiAnalysis?.bestMatchPOI) {
      poiCandidate = state.poiAnalysis.bestMatchPOI;
    }

    const chosenLabelFallback: string | null = state.poiAnalysis?.address || null;
    let chosenLabel: string | null = null;
    let rationale = '';
    let confidence = 'low';

    if (poiCandidate && poiCandidate.name) {
      const category: string = (poiCandidate.category || 'location').toLowerCase();
      const categoryIndex: number = categoryPriority.indexOf(category);
      const tagSnippet: string = tags.slice(0, 3).join(', ') || 'general scene tags';
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

    const sceneDecision: SceneDecision | null = chosenLabel ? { chosenLabel, rationale, confidence } : null;

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
  } catch (err: any) {
    logger.warn('[LangGraph] decide_scene_label failed', err && err.message ? err.message : err);
    return { ...state, sceneDecision: null, debugUsage };
  }
}

export = decide_scene_label;
