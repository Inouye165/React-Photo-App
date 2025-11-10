// server/ai/openaiClient.js
// Singleton OpenAI client instance

const { OpenAI } = require('openai');

// Initialize OpenAI client with API key from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  // Optionally, add organization: process.env.OPENAI_ORG_ID
});

module.exports = openai;
