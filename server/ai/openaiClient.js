// server/ai/openaiClient.js
// Singleton OpenAI client instance


const { OpenAI } = require('openai');
require('../env'); // Make sure env variables are loaded
const auditLogger = require('./langgraph/audit_logger');
const context = require('./langgraph/context');

let openai;
// Prioritize test environment check to avoid real API calls during tests
if (process.env.NODE_ENV === 'test') {
  // In the test environment, provide a dummy object to prevent network calls
  openai = {
    chat: {
      completions: {
        create: () => {
          throw new Error("OpenAI API called in test mode without a key.");
        },
      },
    },
    models: {
      list: () => Promise.resolve({ data: [] })
    }
  };
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
  // Critical failure for non-test environments if key is missing
  throw new Error('OPENAI_API_KEY not set in non-test environment.');
}

module.exports = { openai };
