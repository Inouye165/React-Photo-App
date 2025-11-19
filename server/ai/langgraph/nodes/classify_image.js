const { CLASSIFY_SYSTEM_PROMPT, CLASSIFY_USER_PROMPT } = require('../../prompts/classify_image');
const { openai } = require('../../openaiClient');
const logger = require('../../../logger');

async function classify_image(state) {
  try {
    logger.info('[LangGraph] classify_image node invoked');
    const prompt = CLASSIFY_USER_PROMPT;

    const userContent = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${state.imageMime};base64,${state.imageBase64}`,
          detail: 'low',
        },
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: CLASSIFY_SYSTEM_PROMPT,
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 64,
      response_format: { type: 'json_object' },
    });

    let parsed;
    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch (e) {
      logger.error('[LangGraph] classify_image: Failed to parse model response', e, response.choices[0].message.content);
      return { ...state, error: 'Failed to parse classification response: ' + e.message };
    }
    logger.info('[LangGraph] classify_image: Model classified as', parsed.classification);
    return { ...state, classification: parsed.classification, error: null };
  } catch (err) {
    logger.error('[LangGraph] classify_image: Error', err);
    return { ...state, error: err.message || String(err) };
  }
}

module.exports = classify_image;