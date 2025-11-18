// Prompts for classify_image node

const CLASSIFY_SYSTEM_PROMPT = 'You are a helpful assistant for image classification.';

const CLASSIFY_USER_PROMPT = `Classify this image as one of the following categories: scenery, food, receipt, collectables, health data, or other. Return ONLY a JSON object: {"classification": "..."}.`;

module.exports = { CLASSIFY_SYSTEM_PROMPT, CLASSIFY_USER_PROMPT };
