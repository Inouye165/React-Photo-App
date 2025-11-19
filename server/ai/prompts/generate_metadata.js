// Prompts for generate_metadata node

const GENERATE_METADATA_SYSTEM_PROMPT = 'You are a helpful assistant for photo metadata extraction.';

const GENERATE_METADATA_USER_PROMPT = `You are a photo archivist. Given the image and the following context, generate a JSON object with three fields:\n` +
  `caption: A short, one-sentence title for the photo.\n` +
  `description: A detailed, multi-sentence paragraph describing the visual contents.\n` +
  `keywords: A comma-separated string that begins with the classification provided ({classification}) followed by 4-9 descriptive keywords. After the descriptive keywords, append explicit metadata keywords for capture date, capture time, facing direction, GPS coordinates, and altitude. Use the formats date:YYYY-MM-DD, time:HH:MM:SSZ, direction:<cardinal or degrees>, gps:<latitude,longitude>, altitude:<value>m. When a value is missing, use date:unknown, time:unknown, direction:unknown, gps:unknown, or altitude:unknown.\n` +
  `\nContext:\n` +
  `classification: ${'{classification}'}\n` +
  `metadata: ${'{metadataForPrompt}'}\n` +
  `poiAnalysis: ${'{poiAnalysis}'}\n` +
  `sceneDecision: ${'{sceneDecision}'}\n` +
  `Note: If 'sceneDecision' is present and its confidence is "high" or "medium", prefer using sceneDecision.chosenLabel as the place name or location mention in caption and description. If sceneDecision is absent or confidence is low, do not invent specific POI names; instead use descriptive alternatives.\n` +
  `gps: ${'{gps}'}\n` +
  `device: ${'{device}'}\n` +
  `\nReturn ONLY a JSON object: {"caption": "...", "description": "...", "keywords": "..."}`;

module.exports = { GENERATE_METADATA_SYSTEM_PROMPT, GENERATE_METADATA_USER_PROMPT };
