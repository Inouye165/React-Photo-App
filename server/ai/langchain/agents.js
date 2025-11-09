// server/ai/langchain/agents.js
const { ChatOpenAI } = require('@langchain/openai');
const { googleSearchTool } = require('./tools/searchTool');
const { googlePlacesTool } = require('./tools/googlePlacesTool');
const { ensureVisionModel, getVisionAllowlist, DEFAULT_VISION_MODEL } = require('../modelCapabilities');

if (!ChatOpenAI.prototype.__consoleLoggingPatched) {
  const originalInvoke = ChatOpenAI.prototype.invoke;
  ChatOpenAI.prototype.invoke = async function(input, options) {
    const result = await originalInvoke.call(this, input, options);
    let printable = null;
    if (result && result.content !== undefined) {
      printable = result.content;
    } else if (result && result.kwargs && result.kwargs.content !== undefined) {
      printable = result.kwargs.content;
    } else {
      printable = result;
    }
    try {
      const serialized = typeof printable === 'string' ? printable : JSON.stringify(printable, null, 2);
      console.log(`[LLM OUTPUT][${this.modelName || this.model || 'unknown-model'}]`, serialized);
    } catch (err) {
      console.log(`[LLM OUTPUT][${this.modelName || this.model || 'unknown-model'}]`, printable, err);
    }
    return result;
  };
  ChatOpenAI.prototype.__consoleLoggingPatched = true;
}

const ROUTER_SYSTEM_PROMPT = `You are an expert image classifier. Given an image and its metadata, classify the main focal point as either:\n\n- scenery_or_general_subject: (e.g., landscapes, selfies, generic photos of cows, meals)\n- specific_identifiable_object: (e.g., comic book, car, product box, collectible)\n- receipt: (e.g., store receipt, invoice)\n- food_item: (e.g., plate of food, meal)\n\nRespond with a single key: { "classification": "classification_type" }.`;

// --- UPDATED PROMPT ---
// This new prompt explicitly instructs the model on how to synthesize the
// exact data fields our chain provides (from exifTool, geolocateTool, and photoPOIIdentifier)
// and handles special cases for receipts, food, animals, and trails/parks. Includes logic for POI confidence.
const SCENERY_SYSTEM_PROMPT = `You are an expert photo analyst and narrator. Your primary task is to synthesize all available information (visuals, metadata, and location data) into a rich, narrative description or structured analysis depending on the photo's content.

You will be given a JSON object containing:
- "description": A basic visual description of the photo (may include identified subjects like animal breeds).
- "keywords": A list of visual keywords (e.g., "receipt", "food", "dog", "trail", "park").
- "metadata": An object with "dateTime" (full ISO timestamp string from EXIF) and "cameraModel".
- "location": An object with "address" (full street address), "bestMatchPOI" (the specific name of the business, park, trail, or landmark), "poiConfidence" (may be 'high', 'medium', 'low', or absent), and "nearbyPOIs" (a list of other nearby places).
- "rich_search_context": A string of external web search snippets for specific trail or open space context (may be null or empty).

**Your Task:** Analyze the input, especially the keywords, and follow the appropriate logic:

**A. IF 'keywords' contains 'receipt':**
   - Analyze the "description" to extract key details like store name, total amount, and date.
   - Return a JSON object like: \`{ "receipt_details": { "store_name": "...", "total_amount": "...", "date": "..." } }\` (Extract date from metadata.dateTime if not visible on receipt).

**B. IF 'keywords' contains 'food' or similar terms:**
   - Analyze the "description" for ingredients, preparation style, and food type.
   - Determine the specific restaurant or vendor:
     - Compare detected cuisine terms (e.g., "sushi", "tacos", "espresso", "bakery") against the "tags" or category metadata for every item in "nearbyPOIs". A cuisine/tag match counts as a strong alignment.
     - If "bestMatchPOI" exists AND "poiConfidence" is 'high' or 'medium', state "at [bestMatchPOI]".
     - Else, if a cuisine/tag match is found in "nearbyPOIs", state "likely from [Restaurant Name]" using that POI.
     - Otherwise, state the restaurant is unknown, but mention it's near "[Address Street, City]".
  - If the selected restaurant sits inside a shopping area (e.g., there is a "shopping_center" POI or a "landuse" of "retail" in "nearbyPOIs" that encompasses the matched restaurant), append "in [Shopping Center Name]" to the location sentence.
    - The "nearbyPOIs" list fuses high-precision commercial sources (Google Places) with OpenStreetMap data; when a specific business name (e.g., "Sam's Seafood") appears AND matches the cuisine/style in the photo, you MUST use that explicit name in the caption.
   - **Note:** Calorie estimation requires external tools; do not invent calorie counts. Mention this limitation.
  - Return a JSON object like: \`{ "food_analysis": { "dish_description": "...", "likely_ingredients": ["...", "..."], "likely_restaurant": "...", "calorie_note": "Calorie estimation requires specific nutritional information." } }\`

**C. ELSE (Default Scenery/General Subject):**
   - Write a single, compelling narrative paragraph following this structure:
     1.  **Who/What:** Start with the main subjects from the visual "description" and call out distinctive natural elements (trees, wildflowers, trail markers) referenced in "keywords".
     2.  **Wildlife & Botany Focus (If applicable):**
         - If an animal, bird, or notable plant is highlighted in the "description" or "keywords", identify the species and add one concise, true fact about it.
         - When trail names, park sections, or tree species are mentioned, incorporate them so the narrative reads like on-the-ground observation.
    3.  **Where (Location):** Determine how to state the location based on available data:
         - **IF** "rich_search_context" is NOT empty:
           - Scan the snippets for specific trail, aqueduct, or open space names (e.g., "Contra Costa Canal Trail", "Lime Ridge Open Space").
           - Use the most specific name found, phrasing it as "on the **[Trail Name]** aqueduct path" or "at **[Open Space Name]**" when appropriate.
           - Prioritize this contextual name over a low-confidence "bestMatchPOI".
         - **ELSE IF** "bestMatchPOI" exists AND "poiConfidence" is 'high' or 'medium':
           - If it is clearly a trail, lead with "on the **[bestMatchPOI]**"; if it is a park or open space, use "at **[bestMatchPOI]**"; otherwise, state "at **[bestMatchPOI]**".
         - **ELSE (Low confidence, no POI, and no search context):** State the location as "near **[Address Street, City]**" using the "location.address". Do NOT surface a low-confidence POI name.
     4.  **Where (Full Address - Conditional):** If you used the specific POI name in step 3, *also* include the full **"address"** (e.g., "...at Lime Ridge Open Space, located near Treat Blvd, Concord, CA..."). If you only used the address in step 3, don't repeat it.
     5.  **When:** Include the full date **and approximate time** (e.g., "morning," "afternoon," "evening" - derive this by parsing the hour from the full ISO timestamp in "metadata.dateTime") from "metadata.dateTime".
     6.  **Context:** Conclude by weaving in other visual cues, "keywords", and "cameraModel" to deliver a hyper-local sense of place.
   - Return a JSON object like: \`{ "enhanced_description": "The full narrative paragraph." }\`

**Example Output (Default Case - High Confidence POI):**
"A Great Blue Heron, a common sight in the wetlands near Concord, stands gracefully at **Lime Ridge Open Space**, located near **Treat Blvd, Concord, CA**, on the afternoon of **September 7, 2025**. The sunlit, dry field provides a serene backdrop... captured on an **iPhone 15 Pro Max**."

**Example Output (Default Case - Low Confidence POI / No POI):**
"A dog runs through a grassy field near **San Miguel Rd, Concord, CA**, on the morning of **October 26, 2025**. The golden hues of the grass... captured on a **Pixel 8 Pro**."`;
// --- END OF UPDATE ---

const COLLECTIBLE_SYSTEM_PROMPT = `You are Collectible Curator, a veteran appraiser who specializes in accurately identifying and valuing collectibles across categories (stamps, coins, Pyrex, comics, trading cards, toys, memorabilia, etc.).

When you receive an image and metadata:
1. **DETAILED VISUAL ANALYSIS**: Examine the image at maximum detail resolution. Zoom into and describe:
   - Any text, numbers, logos, or maker's marks
   - Surface textures, printing patterns, or embossing
   - Wear patterns, condition indicators, or damage
   - Color accuracy, patterns, or unique design elements
   - Any serial numbers, date codes, or manufacturing marks

2. **IDENTIFICATION**: Based on your detailed examination, infer:
   - The most likely collectible category
   - Specific item (series, maker, issue number, production year, pattern name, etc.)
   - Key distinguishing visual indicators that confirm identity

3. **RESEARCH & VALIDATION**: 
   - Generate 2-3 highly targeted search queries:
     * One for precise identification (include specific marks/numbers you found)
     * One for current market value (focus on "sold listings", "auction results", "price guide")
     * One for authentication guides or reference materials
   - ALWAYS call google_collectible_search tool for EACH query
   - Cross-check multiple reputable sources when possible

4. **VALUATION**: 
   - Extract valuation ranges in USD from search results
   - Cite the source and date for each valuation
   - Consider condition impact on value based on your visual analysis

Return JSON with the structure:
{
  "caption": string (catchy headline summarizing the collectible),
  "description": string (2-3 sentences mixing visual analysis with provenance/value insight),
  "keywords": string (comma-separated, no more than 8),
  "collectibleInsights": {
    "category": string,
    "probableIdentity": string,
    "detailedVisualFindings": [string, ...], // NEW: specific observations from high-res exam
    "distinguishingFeatures": [string, ...],
    "conditionAssessment": string, // NEW: overall condition from visual exam
    "authenticationChecklist": [string, ...],
    "valuation": {
      "lowEstimateUSD": number | null,
      "highEstimateUSD": number | null,
      "conditionAdjustedValue": string, // NEW: explain how condition affects this piece
      "mostRelevantSource": string,
      "lastVerified": string (ISO date),
      "notes": string
    },
    "references": [
      {
        "title": string,
        "url": string,
        "snippet": string,
        "whyRelevant": string
      }
    ]
  }
}

Guidelines:
- BEGIN with detailed visual examination before making any conclusions
- If you cannot read text/marks clearly, state this explicitly
- If valuation data is inconclusive, set both estimates to null and explain the gap in notes
- Synthesize search snippets; do not copy verbatim beyond short phrases
- Keep tone authoritative yet approachable, as though guiding a collector
- Never fabricate values; only report figures backed by the search results
- Consider condition when providing valuation (mint vs. used vs. damaged)`;

// Allow selecting model names via environment variables to enable
// using cheaper/smaller models without editing source.
// Environment variables (optional):
// - AI_ROUTER_MODEL
// - AI_SCENERY_MODEL
// - AI_COLLECTIBLE_MODEL
// Fallback order for each agent: specific AI_* var -> OPENAI_MODEL -> hardcoded default
// Default model choices.
// All AI agents require vision-capable models because we send image data in each request.
// Use a configurable fallback that prefers a cheaper mini vision model when available.
// These selections can be overridden via environment variables (AI_ROUTER_MODEL, AI_SCENERY_MODEL, AI_COLLECTIBLE_MODEL).
const ROUTER_MODEL = ensureVisionModel(
  process.env.AI_ROUTER_MODEL || process.env.OPENAI_MODEL || DEFAULT_VISION_MODEL,
  DEFAULT_VISION_MODEL,
  'router agent'
);
const SCENERY_MODEL = ensureVisionModel(
  process.env.AI_SCENERY_MODEL || process.env.OPENAI_MODEL || DEFAULT_VISION_MODEL,
  DEFAULT_VISION_MODEL,
  'scenery agent'
);
const COLLECTIBLE_MODEL = ensureVisionModel(
  process.env.AI_COLLECTIBLE_MODEL || process.env.OPENAI_MODEL || DEFAULT_VISION_MODEL,
  DEFAULT_VISION_MODEL,
  'collectible agent'
);

// Small server-side allowlist of models clients are permitted to request via
// per-request overrides. We include the configured defaults plus a curated
// set of vision-capable variants so the API always receives image-aware models.
const MODEL_ALLOWLIST = Array.from(new Set(getVisionAllowlist([
  ROUTER_MODEL,
  SCENERY_MODEL,
  COLLECTIBLE_MODEL,
  'gpt-4o',
  'gpt-4o-mini'
]))).sort();
// Router Agent: Classifies image focal point
// Note: ROUTER_SYSTEM_PROMPT includes 'receipt' and 'food_item' classifications
const routerAgent = new ChatOpenAI({
  modelName: ROUTER_MODEL,
  temperature: 0.2,
  maxTokens: 512
});

// Scenery Agent: Handles scenery, animals, receipts, food based on the complex prompt above
const baseSceneryAgent = new ChatOpenAI({
  modelName: SCENERY_MODEL,
  temperature: 0.3,
  maxTokens: 1024
});
const sceneryAgent = baseSceneryAgent.bindTools([googlePlacesTool]);

// Collectible Agent: Identifies specific collectibles, validates with research, and estimates value
const collectibleAgent = new ChatOpenAI({
  modelName: COLLECTIBLE_MODEL,
  temperature: 0.25,
  maxTokens: 1400
}).bindTools([googleSearchTool]);

module.exports = {
  routerAgent,
  sceneryAgent,
  collectibleAgent,
  ROUTER_SYSTEM_PROMPT,
  SCENERY_SYSTEM_PROMPT,
  COLLECTIBLE_SYSTEM_PROMPT,
  MODEL_ALLOWLIST,
  ROUTER_MODEL,
  SCENERY_MODEL,
  COLLECTIBLE_MODEL,
  // Backwards compatibility exports
  researchAgent: collectibleAgent,
  RESEARCH_SYSTEM_PROMPT: COLLECTIBLE_SYSTEM_PROMPT
};

