// server/ai/openaiClient.js
// Singleton OpenAI client instance


const { OpenAI } = require('openai');
require('../env'); // Ensure env variables are loaded

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
} else {
  // Critical failure for non-test environments if key is missing
  throw new Error('OPENAI_API_KEY not set in non-test environment.');
}

module.exports = { openai };
