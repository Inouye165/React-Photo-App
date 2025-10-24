// server/ai/langchain/agents.js
const { ChatOpenAI } = require('@langchain/openai');
const { googleSearchTool } = require('./tools/searchTool');

// Router Agent: Classifies image focal point
const routerAgent = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.2,
  maxTokens: 512,
  prompt:
    `You are an expert image classifier. Given an image and its metadata, classify the main focal point as either:\n\n- scenery_or_general_subject: (e.g., landscapes, selfies, generic photos of cows, meals)\n- specific_identifiable_object: (e.g., comic book, car, product box, collectible)\n\nRespond with a single key: { "classification": "scenery_or_general_subject" } or { "classification": "specific_identifiable_object" }.`
});

// Scenery Agent: Prioritizes main subjects, then scenery
const sceneryAgent = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 1024,
  prompt:
    `You are an expert photo analyst. Your first task is to identify and describe the main visual subjects (the focal point, e.g., cows, people, animals, objects) in the image.\nAfter describing the focal point, describe the surrounding scenery, location, and context.\nReturn a JSON object with keys: caption, description, keywords, places, animals.`
});

// Research Agent: Identifies object, then researches it
const researchAgent = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 1024,
  tools: [googleSearchTool],
  prompt:
    `You are an expert object identifier and researcher.\nFirst, visually identify the specific object in the photo (e.g., "Uncanny X-Men #137", "1967 Ford Mustang").\nThen, use the Google Search tool to find information about that object (model, breed, value, history, etc).\nSynthesize all findings into a rich description.\nReturn a JSON object with keys: caption, description, keywords, object_info.`
});

module.exports = { routerAgent, sceneryAgent, researchAgent };