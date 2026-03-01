// @ts-nocheck

const { z } = require('zod');

// ============================================================================
// LEGACY SCHEMAS (for backward compatibility)
// ============================================================================

// Helper to transform comma-separated string to array
const KeywordsSchema = z.union([
  z.array(z.string()),
  z.string().transform((str) => str.split(',').map((s) => s.trim()).filter(Boolean))
]);

const MetadataResultSchema = z.object({
  caption: z.string().default(''),
  description: z.string().default(''),
  keywords: KeywordsSchema.default([]),
});

const AnalysisResultSchema = MetadataResultSchema.extend({
  classification: z.union([
    z.string(),
    z.object({
      type: z.string().optional(),
      confidence: z.number().optional(),
      explanation: z.string().optional(),
    })
  ]).optional().nullable(),
  poiAnalysis: z.record(z.any()).optional().nullable(),
  collectibleInsights: z.record(z.any()).optional().nullable(),
}).passthrough();

// ============================================================================
// SPRINT 2: COLLECTIBLE AI CONTRACT SCHEMAS
// ============================================================================

/**
 * ConfidenceField - A generic wrapper that adds confidence scoring to any value.
 * This allows the AI to express uncertainty about individual fields.
 * 
 * @template T - The type of the underlying value
 * @property {T} value - The actual value returned by AI
 * @property {number} confidence - Confidence score between 0 and 1
 * @property {string} [reasoning] - Optional explanation for the confidence level
 */
function createConfidenceFieldSchema(valueSchema: any) {
  return z.object({
    value: valueSchema,
    confidence: z.number().min(0).max(1),
    reasoning: z.string().optional()
  });
}

// Pre-built confidence field schemas for common types
const ConfidenceStringSchema = createConfidenceFieldSchema(z.string());
const ConfidenceNumberSchema = createConfidenceFieldSchema(z.number());

/**
 * Condition Schema - Represents the physical condition of a collectible
 * Uses a 1-5 rank system with human-readable labels
 */
const ConditionSchema = z.object({
  rank: z.number().int().min(1).max(5),
  label: z.enum(['Poor', 'Fair', 'Good', 'Very Good', 'Mint/Near Mint'])
});

// TODO: Future work - Normalized Quality Tiers
// We need to implement per-category quality scales (e.g. Comics: CGC 0.5-10.0, Coins: Sheldon Scale, etc.)
// Currently we use a simple 1-5 rank or free-form text labels.
// See: https://github.com/Inouye165/photo-app/issues/new?title=Implement+Normalized+Quality+Tiers

const ConfidenceConditionSchema = createConfidenceFieldSchema(ConditionSchema);

/**
 * Value Range Schema - Represents estimated monetary value
 * Supports ranges to express market variance
 */
const ValueRangeSchema = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  currency: z.string().default('USD')
});

const ConfidenceValueSchema = createConfidenceFieldSchema(ValueRangeSchema);

/**
 * CollectibleOutputSchema - The strict contract for AI collectible analysis
 * 
 * This schema defines the exact structure the AI must return.
 * All fields use ConfidenceField wrappers for transparency.
 */
const CollectibleOutputSchema = z.object({
  // Core identification
  category: createConfidenceFieldSchema(z.string()),
  
  // Physical condition assessment
  condition: ConfidenceConditionSchema,
  
  // Monetary valuation
  value: ConfidenceValueSchema,
  
  // Category-specific attributes (e.g., publisher, pattern, year)
  // Each specific attribute also has its own confidence score
  specifics: z.record(z.string(), createConfidenceFieldSchema(z.any())).default({})
});

/**
 * Extract clean data from a validated collectible output.
 * This pulls just the .value from each ConfidenceField for database storage.
 * 
 * @param {object} validatedOutput - Output that passed CollectibleOutputSchema.parse()
 * @returns {object} Clean data with just values, no confidence metadata
 */
function extractCleanData(validatedOutput: any) {
  const cleanData = {
    category: validatedOutput.category.value,
    condition: validatedOutput.condition.value,
    value: validatedOutput.value.value,
    specifics: {}
  };
  
  // Extract values from specifics
  for (const [key, field] of Object.entries(validatedOutput.specifics)) {
    cleanData.specifics[key] = field.value;
  }
  
  return cleanData;
}

/**
 * CollectibleAnalysisResultSchema - Full response wrapper for the node
 */
const CollectibleAnalysisResultSchema = z.object({
  collectibleData: z.object({
    cleanData: z.object({
      category: z.string(),
      condition: ConditionSchema,
      value: ValueRangeSchema,
      specifics: z.record(z.string(), z.any()).default({})
    }),
    fullAnalysis: CollectibleOutputSchema
  }),
  status: z.enum(['success', 'partial', 'failed']),
  error: z.string().optional()
});

export {
  // Legacy exports (backward compatibility)
  MetadataResultSchema,
  AnalysisResultSchema,
  
  // Sprint 2: Collectible Contract exports
  createConfidenceFieldSchema,
  ConfidenceStringSchema,
  ConfidenceNumberSchema,
  ConditionSchema,
  ConfidenceConditionSchema,
  ValueRangeSchema,
  ConfidenceValueSchema,
  CollectibleOutputSchema,
  CollectibleAnalysisResultSchema,
  extractCleanData
};
