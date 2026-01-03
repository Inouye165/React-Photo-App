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

  // --- Visual Search Results ---
  // Top visual matches from Google Lens (SerpApi) for grounding collectible identification
  visualMatches: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
        thumbnail: z.string(),
        source: z.string(),
      })
    )
    .nullable()
    .optional(),

  // --- Step 3: Narrative/Final Output ---
  // The final JSON result from the Scenery or Collectible agent
  finalResult: z.object({
    caption: z.string(),
    description: z.string(),
    keywords: z.string(),
    classification: z.string().nullable(),
    collectibleInsights: z.any().optional(),
  }).nullable(),

  // --- Collectible (canonical) ---
  // Canonical structure for HITL identification + review + valuation.
  collectible: z
    .object({
      identification: z
        .object({
          id: z.string().nullable(),
          category: z.string().nullable(),
          confidence: z.number().nullable(),
          fields: z.any().nullable().optional(),
          source: z.enum(['ai', 'human']).nullable(),
        })
        .nullable(),
      review: z
        .object({
          status: z.enum(['pending', 'confirmed', 'rejected']).nullable(),
          ticketId: z.string().nullable(),
          confirmedBy: z.string().nullable(),
          confirmedAt: z.string().nullable(),
          editHistory: z.array(z.any()).optional(),
          version: z.number().nullable().optional(),
          expiresAt: z.string().nullable().optional(),
        })
        .nullable(),
      valuation: z
        .object({
          low: z.number().nullable(),
          high: z.number().nullable(),
          currency: z.string(),
          reasoning: z.string().optional(),
          market_data: z
            .array(
              z.object({
                price: z.number(),
                venue: z.string(),
                url: z.string().nullable(),
                date_seen: z.string().optional(),
                condition_label: z.string().nullable().optional(),
              })
            )
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),

  // Optional human override to be applied before any further collectible AI work.
  // Intended for HITL resume flows.
  collectibleOverride: z
    .object({
      id: z.string(),
      category: z.string().nullable().optional(),
      fields: z.any().nullable().optional(),
      confirmedBy: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),

  // Result from handle_collectible node containing structured analysis data
  collectibleResult: z.object({
    collectibleData: z.object({
      cleanData: z.any(),
      fullAnalysis: z.any()
    }).nullable(),
    status: z.enum(['success', 'skipped', 'failed']),
    reason: z.string().optional(),
    error: z.string().optional()
  }).nullable().optional(),
  // Search results from tool calls (for describe_collectible to cite sources)
  collectibleSearchResults: z.array(z.object({
    tool: z.string(),
    observation: z.string().optional(),
    summary: z.string().optional()
  })).nullable().optional(),

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

// Helper to create a standard reducer for all fields
// This ensures that updates from nodes are merged correctly (last write wins)
// and that we have explicit channel definitions for LangGraph.
function createGraphChannels(schema) {
  const channels = {};
  const override = (prev, next) => (next === undefined ? prev : next);

  for (const key in schema.shape) {
    channels[key] = {
      reducer: override,
      default: () => null,
    };
  }

  return channels;
}

const graphChannels = createGraphChannels(AppState);

// We must export the type for use in the graph builder
module.exports = { AppState, graphChannels };
