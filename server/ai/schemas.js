const { z } = require('zod');

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

module.exports = {
  MetadataResultSchema,
  AnalysisResultSchema,
};
