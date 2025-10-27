// server/ai/langchain/agents.js
const { ChatOpenAI } = require('@langchain/openai');
const { googleSearchTool } = require('./tools/searchTool');

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

**Your Task:** Analyze the input, especially the keywords, and follow the appropriate logic:

**A. IF 'keywords' contains 'receipt':**
  - Analyze the "description" to extract key details like store name, total amount, and date.
  - Return a JSON object like: \`{ "receipt_details": { "store_name": "...", "total_amount": "...", "date": "..." } }\` (Extract date from metadata.dateTime if not visible on receipt).

**B. IF 'keywords' contains 'food' or similar terms:**
  - Analyze the "description" for ingredients and food type.
  - Make an educated guess for the restaurant:
    - If "bestMatchPOI" exists AND "poiConfidence" is 'high' or 'medium', state "at [bestMatchPOI]".
    - Else, check if any "nearbyPOIs" strongly match the food type (e.g., photo shows tacos, nearby POI is "Taco Bell"). If a likely match is found, state "likely from [Restaurant Name]".
    - Otherwise, state the restaurant is unknown, but mention it's near "[Address Street, City]".
  - **Note:** Calorie estimation requires external tools; do not invent calorie counts. Mention this limitation.
  - Return a JSON object like: \`{ "food_analysis": { "dish_description": "...", "likely_ingredients": ["...", "..."], "likely_restaurant": "...", "calorie_note": "Calorie estimation requires specific nutritional information." } }\`

**C. ELSE (Default Scenery/General Subject):**
  - Write a single, compelling narrative paragraph following this structure:
    1.  **Who/What:** Start with the main subjects from the visual "description".
    2.  **Animal Focus (If applicable):** If an animal is the main subject and its breed/species is mentioned in the "description" (e.g., "a Golden Retriever", "a Great Blue Heron"):
      - Identify the breed/species.
      - Add one brief, interesting fact about it (e.g., "Golden Retrievers are known for their friendly nature", "Great Blue Herons are skilled fish hunters").
      - Use GPS context if helpful (e.g., "...a Great Blue Heron, a common sight in the wetlands near Concord...").
    3.  **Where (Location):** Determine how to state the location based on "bestMatchPOI" and "poiConfidence":
      - **IF** "bestMatchPOI" exists AND "poiConfidence" is 'high' or 'medium':
        - If "bestMatchPOI" is clearly a trail (e.g., "Contra Costa Canal Trail"), state "on the **[bestMatchPOI]**".
        - If "bestMatchPOI" is a park/open space (e.g., "Lime Ridge Open Space"), state "at **[bestMatchPOI]**". Consider "near the edge of **[bestMatchPOI]**" if visually appropriate.
        - Otherwise (e.g., a business), state "at **[bestMatchPOI]**".
      - **ELSE (Low confidence or no POI):** State the location as "near **[Address Street, City]**" using the "location.address". Do NOT mention the low-confidence bestMatchPOI name.
    4.  **Where (Full Address - Conditional):** If you used the specific POI name in step 3, *also* include the full **"address"** (e.g., "...at Lime Ridge Open Space, located near Treat Blvd, Concord, CA..."). If you only used the address in step 3, don't repeat it.
    5.  **When:** Include the full date **and approximate time** (e.g., "morning," "afternoon," "evening" - derive this by parsing the hour from the full ISO timestamp in "metadata.dateTime") from "metadata.dateTime".
    6.  **Context:** Conclude by weaving in the other visual details, "keywords", and "cameraModel" to set the scene.
  - Return a JSON object like: \`{ "enhanced_description": "The full narrative paragraph." }\`

**Example Output (Default Case - High Confidence POI):**
"A Great Blue Heron, a common sight in the wetlands near Concord, stands gracefully at **Lime Ridge Open Space**, located near **Treat Blvd, Concord, CA**, on the afternoon of **September 7, 2025**. The sunlit, dry field provides a serene backdrop... captured on an **iPhone 15 Pro Max**."

**Example Output (Default Case - Low Confidence POI / No POI):**
"A dog runs through a grassy field near **San Miguel Rd, Concord, CA**, on the morning of **October 26, 2025**. The golden hues of the grass... captured on a **Pixel 8 Pro**."`;
// --- END OF UPDATE ---

const RESEARCH_SYSTEM_PROMPT = `You are an expert object identifier and researcher.
1. Visually identify the specific object in the photo (e.g., "Uncanny X-Men #137", "1967 Ford Mustang").
2. Use the Google Search tool to find information about that object (model, history, etc.) AND its current market value.
3. Synthesize all findings.
4. Return a JSON object with keys: caption, description, keywords, object_info.
5. **CRITICAL:** If the object is a collectible (like a comic book or sports card), the 'object_info' field MUST be a JSON object containing:
  - 'item_name': (e.g., "The New Mutants #34")
  - 'visual_condition': (Your best guess, e.g., "Good")
  - 'value_ranges': A JSON object of estimated prices for different conditions (e.g., { "Mint": "$50-$70", "Good": "$10-$15", "Poor": "$1-5" }).
  - 'disclaimer': "Estimates are based on recent market data and visual analysis, not a professional appraisal."
You MUST provide the 'value_ranges' object for collectibles. Do not omit it.`;

// Router Agent: Classifies image focal point
// Note: ROUTER_SYSTEM_PROMPT includes 'receipt' and 'food_item' classifications
const routerAgent = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.2,
  maxTokens: 512
});

// Scenery Agent: Handles scenery, animals, receipts, food based on the complex prompt above
const sceneryAgent = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.3,
  maxTokens: 1024
});

// Research Agent: Identifies specific objects and researches them
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

