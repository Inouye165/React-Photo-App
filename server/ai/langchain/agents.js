// server/ai/langchain/agents.js
const { ChatOpenAI } = require('@langchain/openai');
const { googleSearchTool } = require('./tools/searchTool');

const ROUTER_SYSTEM_PROMPT = `You are an expert image classifier. Given an image and its metadata, classify the main focal point as either:\n\n- scenery_or_general_subject: (e.g., landscapes, selfies, generic photos of cows, meals)\n- specific_identifiable_object: (e.g., comic book, car, product box, collectible)\n\nRespond with a single key: { "classification": "scenery_or_general_subject" } or { "classification": "specific_identifiable_object" }.`;

const SCENERY_SYSTEM_PROMPT = `You are an expert photo analyst. Your first task is to identify and describe the main visual subjects (the focal point, e.g., cows, people, animals, objects) in the image. After describing the focal point, describe the surrounding scenery, location, and context. Return a JSON object with keys: caption, description, keywords, places, animals.`;

const RESEARCH_SYSTEM_PROMPT = `You are an expert object identifier and researcher. First, visually identify the specific object in the photo (e.g., "Uncanny X-Men #137", "1967 Ford Mustang"). Then, use the Google Search tool to find information about that object (model, breed, value, history, etc). Synthesize all findings into a rich description. Return a JSON object with keys: caption, description, keywords, object_info.`;

// Router Agent: Classifies image focal point
const routerAgent = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.2,
  maxTokens: 512
});

// Scenery Agent: Prioritizes main subjects, then scenery
const sceneryAgent = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 1024
});

// Research Agent: Identifies object, then researches it
const researchAgent = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 1024,
  tools: [googleSearchTool]
});

module.exports = {
  routerAgent,
  sceneryAgent,
  researchAgent,
  ROUTER_SYSTEM_PROMPT,
  SCENERY_SYSTEM_PROMPT,
  RESEARCH_SYSTEM_PROMPT
};