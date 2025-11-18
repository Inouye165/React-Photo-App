// File: c:\Users\Ron\React-Photo-App\server\ai\langgraph\state.js
const { z } = require('zod');

/**
 * Defines the central state object for the entire AI processing graph.
 * This object is passed to each node, which can read from and write to it.
 */
const PassthroughObject = z.object({}).passthrough();

const AppState = z.object({
  // --- Initial Inputs ---
  filename: z.string(),
  fileBuffer: z.any(), // Will be a Buffer
  imageBase64: z.string(), // Base64 representation
  imageMime: z.string(),
  metadata: z.union([PassthroughObject, z.null(), z.undefined()]).transform(val => val ?? {}),
  gpsString: z.string().nullable(), // e.g., "37.95, -122.01"
  device: z.string().nullable(),
  modelOverrides: z.union([PassthroughObject, z.null(), z.undefined()]).transform(val => val ?? {}),

  // --- Step 1: Router Output ---
  classification: z.string().nullable(), // 'scenery_or_general_subject' or 'specific_identifiable_object'

  // --- Step 2: POI & Search Outputs ---
  // The full, rich output from the photoPOIIdentifier tool
  poiAnalysis: z.object().passthrough().nullable(),
  // Cache of collected POI results to avoid repeating expensive lookups
  poiCache: z.object().passthrough().nullable(),
  // Small summary about the cache: counts and timing
  poiCacheSummary: z
    .object({
      reverse: z.boolean().optional(),
      nearbyPlacesCount: z.number().optional(),
      nearbyFoodCount: z.number().optional(),
      osmTrailsCount: z.number().optional(),
      durationMs: z.number().optional(),
    })
    .nullable()
    .optional(),
  // Timestamp string for when poiCache was fetched
  poiCacheFetchedAt: z.string().nullable().optional(),
  // The specific context snippets from the fallback web search
  rich_search_context: z.string().nullable(),

  // --- Step 3: Narrative/Final Output ---
  // The final JSON result from the Scenery or Collectible agent
  finalResult: z.object({
    caption: z.string(),
    description: z.string(),
    keywords: z.string(),
    classification: z.string().nullable(),
    collectibleInsights: z.any().optional(),
  }).nullable(),

  // --- Utility ---
  // To hold error messages if a step fails
  error: z.string().nullable(),
    sceneDecision: z
      .object({
        chosenLabel: z.string(),
        rationale: z.string(),
        confidence: z.union([z.literal('high'), z.literal('medium'), z.literal('low')]),
      })
      .nullable()
      .optional(),
});

// We must export the type for use in the graph builder
module.exports = { AppState };
