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

    return {
      ...state,
      collectible_id: parsed.id,
      collectible_id_confidence: parsed.confidence,
      collectible_category: parsed.category,
    };
  } catch (err) {
    logger.error('[LangGraph] identify_collectible: Error', err);
    return { ...state, error: err.message };
  }
}

module.exports = identify_collectible;
