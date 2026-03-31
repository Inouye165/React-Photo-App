// Prompts for decide_scene_label node

export const DECIDE_SCENE_SYSTEM_PROMPT: string = 'You are a short-image-tagger assistant. Respond with JSON object {"tags": [..] }.';

export const DECIDE_SCENE_USER_PROMPT: string = 'Provide a short list of descriptive tags (single words) about the image content, like ["geyser","steam","hotel","trail","flower","closeup"]. Return JSON only.';

module.exports = { DECIDE_SCENE_SYSTEM_PROMPT, DECIDE_SCENE_USER_PROMPT };
