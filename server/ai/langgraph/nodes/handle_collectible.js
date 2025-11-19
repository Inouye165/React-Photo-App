const { SystemMessage, HumanMessage } = require('@langchain/core/messages');
const { collectibleAgent, COLLECTIBLE_SYSTEM_PROMPT } = require('../../langchain/agents');
const logger = require('../../../logger');

async function handle_collectible(state) {
  try {
    logger.info('[LangGraph] handle_collectible node invoked (specialist)');

    const messages = [
      new SystemMessage(COLLECTIBLE_SYSTEM_PROMPT),
      new HumanMessage({
        content: [
          {
            type: 'text',
            text: `Analyze this collectible image. Metadata keys: ${Object.keys(state.metadata || {}).join(', ')}`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${state.imageMime};base64,${state.imageBase64}`,
              detail: 'high',
            },
          },
        ],
      }),
    ];

    const response = await collectibleAgent.invoke(messages);

    let parsed;
    try {
      parsed = JSON.parse(response.content);
    } catch (e) {
      logger.error('[LangGraph] handle_collectible: FAILED TO PARSE AGENT RESPONSE. This often means the agent failed to call a tool (e.g., missing API key) and returned a simple text fallback.', {
        error: e.message,
        raw_response: response.content,
      });
      return { ...state, error: 'Failed to parse collectible agent response: ' + e.message };
    }
    logger.info('[LangGraph] handle_collectible: Specialist agent returned');
    parsed.classification = state.classification;
    return { ...state, finalResult: parsed, error: null };
  } catch (err) {
    logger.error('[LangGraph] handle_collectible: Error', err);
    return { ...state, error: err.message || String(err) };
  }
}

module.exports = handle_collectible;