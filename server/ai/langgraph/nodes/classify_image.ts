// server/ai/langgraph/nodes/classify_image.ts
// Entry node for ALL AI photo analysis: sends the image to GPT-4o and
// returns the primary classification that routes the rest of the pipeline.

const { CLASSIFY_SYSTEM_PROMPT, CLASSIFY_USER_PROMPT } = require('../../prompts/classify_image') as {
  CLASSIFY_SYSTEM_PROMPT: string;
  CLASSIFY_USER_PROMPT: string;
};
const { openai } = require('../../openaiClient') as { openai: import('openai').OpenAI };
const logger = require('../../../logger');

interface ClassifyImageState {
  imageMime: string;
  imageBase64: string;
  classification?: string | null;
  error?: string | null;
  runId?: string;
  [key: string]: unknown;
}

type ClassifyImageResult = ClassifyImageState & {
  classification: string | null;
  error: string | null;
};

async function classify_image(state: ClassifyImageState): Promise<ClassifyImageResult> {
  try {
    logger.info('[LangGraph] classify_image node invoked');
    const prompt = CLASSIFY_USER_PROMPT;

    const userContent = [
      { type: 'text' as const, text: prompt },
      {
        type: 'image_url' as const,
        image_url: {
          url: `data:${state.imageMime};base64,${state.imageBase64}`,
          detail: 'low' as const,
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

    let parsed: { classification?: string };
    try {
      const rawContent = response.choices[0]?.message?.content ?? '';
      parsed = JSON.parse(rawContent) as { classification?: string };
    } catch (e) {
      const err = e as Error;
      logger.error(
        '[LangGraph] classify_image: Failed to parse model response',
        err,
        response.choices[0]?.message?.content
      );
      return { ...state, classification: null, error: 'Failed to parse classification response: ' + err.message };
    }
    logger.info('[LangGraph] classify_image: Model classified as', parsed.classification);
    return { ...state, classification: parsed.classification ?? null, error: null };
  } catch (err) {
    const e = err as Error;
    logger.error('[LangGraph] classify_image: Error', e);
    return { ...state, classification: null, error: e.message || String(e) };
  }
}

export = classify_image;
