const { openai } = require('../../openaiClient');
const logger = require('../../../logger');

const IDENTIFY_SYSTEM_PROMPT = `You are an expert visual identifier of collectibles.
Your ONLY job is to identify the item in the image as precisely as possible.
Return a JSON object with:
- "id": A precise identification string (e.g., "Marvel Power Pack #1, 1984", "Pyrex Butterprint Mixing Bowl 403").
- "confidence": A number between 0 and 1.
- "category": A broad category (e.g., "Comics", "Kitchenware", "Trading Cards").

Do NOT estimate value.
Do NOT describe the background.
Focus ONLY on the item identity.`;

async function identify_collectible(state) {
  try {
    logger.info('[LangGraph] identify_collectible: Enter');

    // HITL resume path: if a human override is provided, skip the LLM call.
    if (state.collectibleOverride && typeof state.collectibleOverride.id === 'string' && state.collectibleOverride.id.trim()) {
      const override = state.collectibleOverride;
      const prev = state.collectible || {};

      logger.info('[LangGraph] identify_collectible: Using human override; skipping AI identify', {
        id: override.id,
        category: override.category || null,
      });

      return {
        ...state,
        collectible: {
          ...prev,
          identification: {
            id: override.id.trim(),
            category: (override.category ?? prev.identification?.category ?? null),
            confidence: 1,
            fields: (override.fields ?? prev.identification?.fields ?? null),
            source: 'human',
          },
          review: prev.review || null,
          valuation: prev.valuation || null,
        },
      };
    }
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: IDENTIFY_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Identify this collectible item.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${state.imageMime};base64,${state.imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      logger.error('[LangGraph] identify_collectible: Failed to parse JSON', e);
      return { ...state, error: 'Failed to parse identification response' };
    }

    logger.info('[LangGraph] identify_collectible: Identified', parsed);

    logger.info('[LangGraph] identify_collectible: Output fields', {
      inputClassification: state.classification || null,
      inputClassificationRaw: state.classification_raw || null,
      collectible_id: parsed.id,
      collectible_id_confidence: parsed.confidence,
      collectible_category: parsed.category,
    });

    const prev = state.collectible || {};
    return {
      ...state,
      collectible: {
        ...prev,
        identification: {
          id: parsed.id ?? null,
          category: parsed.category ?? null,
          confidence: (typeof parsed.confidence === 'number' ? parsed.confidence : null),
          fields: parsed.fields ?? null,
          source: 'ai',
        },
        review: prev.review || null,
        valuation: prev.valuation || null,
      },
    };
  } catch (err) {
    logger.error('[LangGraph] identify_collectible: Error', err);
    return { ...state, error: err.message };
  }
}

module.exports = identify_collectible;
