// server/ai/openaiClient.js
// Singleton OpenAI client instance


const { OpenAI } = require('openai');
require('../env'); // Make sure env variables are loaded
const { isAiEnabled } = require('../utils/aiEnabled');
const auditLogger = require('./langgraph/audit_logger');
const context = require('./langgraph/context');

function createDisabledClient(message) {
  return {
    chat: {
      completions: {
        create: () => {
          throw new Error(message);
        },
      },
    },
    models: {
      list: () => Promise.resolve({ data: [] })
    }
  };
}

let openai;
// Prioritize test environment check to avoid real API calls during tests
if (process.env.NODE_ENV === 'test') {
  // In the test environment, provide a dummy object to prevent network calls
  openai = createDisabledClient('OpenAI API called in test mode without a key.');
} else if (!isAiEnabled()) {
  openai = createDisabledClient('AI is disabled. Set AI_ENABLED=true (or ENABLE_AI=true) to enable.');
} else if (process.env.OPENAI_API_KEY) {
  // Use the actual client if the API key is set
  openai = new OpenAI();
  
  // Wrap chat.completions.create to log usage if within a graph execution context
  const originalCreate = openai.chat.completions.create.bind(openai.chat.completions);
  openai.chat.completions.create = async (params, options) => {
    const store = context.getStore();
    if (store) {
      const { runId, nodeName } = store;
      
      try {
        const response = await originalCreate(params, options);
        const responseText = response.choices?.[0]?.message?.content || JSON.stringify(response);
        const model = response.model || params.model;
        
        auditLogger.logLLMUsage(runId, nodeName, model, params.messages, responseText);
        return response;
      } catch (err) {
        auditLogger.logLLMUsage(runId, nodeName, params.model, params.messages, `Error: ${err.message}`);
        throw err;
      }
    } else {
      return originalCreate(params, options);
    }
  };
} else {
  // Provide a stub client so modules can load; fail only if invoked.
  openai = createDisabledClient('OPENAI_API_KEY not set in non-test environment.');
}

module.exports = { openai };
