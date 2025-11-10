// server/ai/openaiClient.js
// Singleton OpenAI client instance


const { OpenAI } = require('openai');
require('../env'); // Ensure env variables are loaded

let openai;
if (process.env.OPENAI_API_KEY) {
  // Use the actual client if the API key is set
  openai = new OpenAI();
} else if (process.env.NODE_ENV === 'test') {
  // In the test environment without a key, provide a dummy object.
  // This prevents module load failure for tests that don't need a real API connection.
  openai = {
    chat: {
      completions: {
        create: () => {
          throw new Error("OpenAI API called in test mode without a key.");
        },
      },
    },
    // Add other mocked methods/namespaces as needed by tests.
    // The key is that this object can be instantiated without crashing.
  };
} else {
  // Critical failure for non-test environments if key is missing
  throw new Error('OPENAI_API_KEY not set in non-test environment.');
}

module.exports = { openai };
