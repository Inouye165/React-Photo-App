// server/ai/langchain/tools/searchTool.js
const { GoogleCustomSearch } = require('@langchain/community/tools/google_custom_search');

const googleSearchTool = new GoogleCustomSearch({
  apiKey: process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.trim() : undefined,
  googleCSEId: process.env.GOOGLE_CSE_ID ? process.env.GOOGLE_CSE_ID.trim() : undefined,
});

module.exports = { googleSearchTool };