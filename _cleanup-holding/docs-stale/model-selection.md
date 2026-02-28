# Dynamic OpenAI Model Selection

The photo server now builds its OpenAI model allowlist at startup instead of relying on a hardcoded array.

## Startup Behaviour
- `server/routes/photos.js` initializes an OpenAI SDK client and invokes `loadDynamicAllowList()` during module load.
- The function calls `openai.models.list()` using the API key provided via `OPENAI_API_KEY`.
- Returned model IDs are filtered to keep chat and vision capable models only. Matching prefixes include `gpt-5`, `gpt-4`, `gpt-3.5`, `ft:`, `o1`, and `o3`.
- Application-specific model aliases (`router`, `scenery`, `collectible`) are appended so existing jobs continue to resolve correctly.

## Fallback Logic
- Before the async fetch completes, the in-memory allowlist is seeded with a fallback set: `gpt-4o`, `gpt-4-vision-preview`, `gpt-3.5-turbo`, and `gpt-5`.
- If the OpenAI API request fails (missing key, network error, etc.) or returns no eligible models, the fallback list remains in place and the incident is logged.

## Filtering Rules
- The selection removes non-language and non-vision endpoints such as embeddings, TTS, audio-only, moderation, realtime, and image-generation models (`gpt-image-1`, `dall-e`, etc.).
- This keeps downstream AI processing constrained to models that can perform text or vision analysis safely.
