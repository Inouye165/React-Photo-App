// Prompts for classify_image node

export const CLASSIFY_SYSTEM_PROMPT: string = 'You are a helpful assistant for image classification.';

export const CLASSIFY_USER_PROMPT: string = `Classify this image as one of the following categories: scenery, food, receipt, collectables, health data, or other. Return ONLY a JSON object: {"classification": "..."}.`;

module.exports = { CLASSIFY_SYSTEM_PROMPT, CLASSIFY_USER_PROMPT };
