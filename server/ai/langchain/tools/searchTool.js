// server/ai/langchain/tools/searchTool.js
const { GoogleCustomSearch } = require('@langchain/community/tools/google_custom_search');

console.log('[searchTool] GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY);
console.log('[searchTool] GOOGLE_CSE_ID:', process.env.GOOGLE_CSE_ID);

const googleSearchTool = new GoogleCustomSearch({
  apiKey: process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.trim() : undefined,
  googleCSEId: process.env.GOOGLE_CSE_ID ? process.env.GOOGLE_CSE_ID.trim() : undefined,
});

module.exports = { googleSearchTool };