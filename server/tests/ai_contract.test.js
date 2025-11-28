/**
 * AI Contract Tests - Sprint 2
 * 
 * These tests verify the AI Contract Layer for the Smart Collector module:
 * 1. Zod schema validation (CollectibleOutputSchema)
 * 2. Node error handling for malformed responses
 * 3. Low confidence handling (valid data, just flagged)
 * 4. Specifics extraction and preservation
 * 
 * CRITICAL: These tests mock the LangChain model - no real OpenAI API calls.
 * 
 * @module server/tests/ai_contract.test.js
 */

'use strict';

// Set feature flag for tests
process.env.ENABLE_COLLECTIBLES_AI = 'true';

const {
  CollectibleOutputSchema,
  extractCleanData,
  ConditionSchema,
  ValueRangeSchema
} = require('../ai/schemas');

const {
  AI_CONFIDENCE,
  getConfidenceLevel,
  needsReview,
  isSuggestionOnly
} = require('../config/aiConfig');

// Mock the collectibleAgent before requiring the node
jest.mock('../ai/langchain/agents', () => ({
  collectibleAgent: {
    invoke: jest.fn()
  }
}));

// Mock the logger
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const { collectibleAgent } = require('../ai/langchain/agents');
const handle_collectible = require('../ai/langgraph/nodes/handle_collectible');

describe('AI Contract Layer - Sprint 2', () => {
  
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_COLLECTIBLES_AI = 'true';
  });

  describe('AI Configuration', () => {
    test('AI_CONFIDENCE thresholds are correctly defined', () => {
      expect(AI_CONFIDENCE.HIGH).toBe(0.9);
      expect(AI_CONFIDENCE.REVIEW).toBe(0.8);
      expect(AI_CONFIDENCE.LOW).toBe(0.5);
    });

    test('getConfidenceLevel returns correct labels', () => {
      expect(getConfidenceLevel(0.95)).toBe('high');
      expect(getConfidenceLevel(0.9)).toBe('high');
      expect(getConfidenceLevel(0.85)).toBe('review');
      expect(getConfidenceLevel(0.8)).toBe('review');
      expect(getConfidenceLevel(0.6)).toBe('low');
      expect(getConfidenceLevel(0.5)).toBe('low');
      expect(getConfidenceLevel(0.4)).toBe('very_low');
      expect(getConfidenceLevel(0.1)).toBe('very_low');
    });

    test('needsReview correctly identifies values below threshold', () => {
      expect(needsReview(0.9)).toBe(false);
      expect(needsReview(0.85)).toBe(false);
      expect(needsReview(0.79)).toBe(true);
      expect(needsReview(0.5)).toBe(true);
    });

    test('isSuggestionOnly correctly identifies low confidence', () => {
      expect(isSuggestionOnly(0.9)).toBe(false);
      expect(isSuggestionOnly(0.5)).toBe(false);
      expect(isSuggestionOnly(0.49)).toBe(true);
      expect(isSuggestionOnly(0.1)).toBe(true);
    });
  });

  describe('Zod Schemas', () => {
    describe('ConditionSchema', () => {
      test('accepts valid condition values', () => {
        const validConditions = [
          { rank: 1, label: 'Poor' },
          { rank: 2, label: 'Fair' },
          { rank: 3, label: 'Good' },
          { rank: 4, label: 'Very Good' },
          { rank: 5, label: 'Mint/Near Mint' }
        ];

        validConditions.forEach(condition => {
          const result = ConditionSchema.safeParse(condition);
          expect(result.success).toBe(true);
        });
      });

      test('rejects invalid rank values', () => {
        const result = ConditionSchema.safeParse({ rank: 6, label: 'Perfect' });
        expect(result.success).toBe(false);
      });

      test('rejects invalid label values', () => {
        const result = ConditionSchema.safeParse({ rank: 3, label: 'Average' });
        expect(result.success).toBe(false);
      });
    });

    describe('ValueRangeSchema', () => {
      test('accepts valid value range', () => {
        const result = ValueRangeSchema.safeParse({
          min: 10,
          max: 25,
          currency: 'USD'
        });
        expect(result.success).toBe(true);
        expect(result.data.currency).toBe('USD');
      });

      test('provides default currency', () => {
        const result = ValueRangeSchema.safeParse({
          min: 10,
          max: 25
        });
        expect(result.success).toBe(true);
        expect(result.data.currency).toBe('USD');
      });

      test('rejects negative values', () => {
        const result = ValueRangeSchema.safeParse({
          min: -10,
          max: 25,
          currency: 'USD'
        });
        expect(result.success).toBe(false);
      });
    });

    describe('CollectibleOutputSchema', () => {
      const validOutput = {
        category: {
          value: 'Pyrex',
          confidence: 0.95,
          reasoning: 'Clear Pyrex branding visible'
        },
        condition: {
          value: { rank: 3, label: 'Good' },
          confidence: 0.85,
          reasoning: 'Minor scratches visible but overall good condition'
        },
        value: {
          value: { min: 25, max: 45, currency: 'USD' },
          confidence: 0.75,
          reasoning: 'Based on recent eBay sold listings'
        },
        specifics: {
          pattern: {
            value: 'Butterprint',
            confidence: 0.92,
            reasoning: 'Distinctive turquoise and white pattern'
          },
          size: {
            value: '401',
            confidence: 0.88
          }
        }
      };

      test('Valid Schema Test - accepts perfect JSON object', () => {
        const result = CollectibleOutputSchema.safeParse(validOutput);
        
        expect(result.success).toBe(true);
        expect(result.data.category.value).toBe('Pyrex');
        expect(result.data.condition.value.rank).toBe(3);
        expect(result.data.value.value.min).toBe(25);
        expect(result.data.specifics.pattern.value).toBe('Butterprint');
      });

      test('cleanData extraction works correctly', () => {
        const result = CollectibleOutputSchema.safeParse(validOutput);
        expect(result.success).toBe(true);
        
        const cleanData = extractCleanData(result.data);
        
        expect(cleanData.category).toBe('Pyrex');
        expect(cleanData.condition).toEqual({ rank: 3, label: 'Good' });
        expect(cleanData.value).toEqual({ min: 25, max: 45, currency: 'USD' });
        expect(cleanData.specifics.pattern).toBe('Butterprint');
        expect(cleanData.specifics.size).toBe('401');
      });

      test('Invalid Schema Test - rejects malformed JSON (missing required fields)', () => {
        const invalidOutput = {
          category: {
            value: 'Pyrex',
            confidence: 0.95
          }
          // Missing condition and value
        };

        const result = CollectibleOutputSchema.safeParse(invalidOutput);
        expect(result.success).toBe(false);
        expect(result.error.errors.length).toBeGreaterThan(0);
      });

      test('Invalid Schema Test - rejects invalid confidence range', () => {
        const invalidOutput = {
          ...validOutput,
          category: {
            value: 'Pyrex',
            confidence: 1.5 // Invalid: > 1
          }
        };

        const result = CollectibleOutputSchema.safeParse(invalidOutput);
        expect(result.success).toBe(false);
      });

      test('Low Confidence Test - accepts low confidence (valid data, just flagged)', () => {
        const lowConfidenceOutput = {
          category: {
            value: 'Unknown Ceramic',
            confidence: 0.4,
            reasoning: 'Cannot clearly identify brand'
          },
          condition: {
            value: { rank: 2, label: 'Fair' },
            confidence: 0.35,
            reasoning: 'Image quality too low for detailed assessment'
          },
          value: {
            value: { min: 5, max: 50, currency: 'USD' },
            confidence: 0.25,
            reasoning: 'Very uncertain without clear identification'
          },
          specifics: {}
        };

        const result = CollectibleOutputSchema.safeParse(lowConfidenceOutput);
        
        // Low confidence is still valid data
        expect(result.success).toBe(true);
        expect(result.data.category.confidence).toBe(0.4);
        expect(result.data.condition.confidence).toBe(0.35);
        expect(result.data.value.confidence).toBe(0.25);
        
        // But it should be flagged as needing review
        expect(needsReview(result.data.category.confidence)).toBe(true);
        expect(isSuggestionOnly(result.data.value.confidence)).toBe(true);
      });

      test('Specifics Extraction - preserves all attributes', () => {
        const outputWithSpecifics = {
          ...validOutput,
          specifics: {
            pattern: {
              value: 'Butterprint',
              confidence: 0.92,
              reasoning: 'Distinctive turquoise and white pattern'
            },
            year_range: {
              value: '1957-1968',
              confidence: 0.85
            },
            color: {
              value: 'Turquoise on White',
              confidence: 0.98
            },
            size: {
              value: '401 (1.5 pint)',
              confidence: 0.88
            }
          }
        };

        const result = CollectibleOutputSchema.safeParse(outputWithSpecifics);
        expect(result.success).toBe(true);

        const cleanData = extractCleanData(result.data);
        
        // Verify specifics are preserved in cleanData
        expect(cleanData.specifics.pattern).toBe('Butterprint');
        expect(cleanData.specifics.year_range).toBe('1957-1968');
        expect(cleanData.specifics.color).toBe('Turquoise on White');
        expect(cleanData.specifics.size).toBe('401 (1.5 pint)');

        // Verify full analysis still has confidence scores
        expect(result.data.specifics.pattern.confidence).toBe(0.92);
        expect(result.data.specifics.year_range.confidence).toBe(0.85);
      });

      test('handles empty specifics gracefully', () => {
        const outputNoSpecifics = {
          category: validOutput.category,
          condition: validOutput.condition,
          value: validOutput.value
          // specifics not provided
        };

        const result = CollectibleOutputSchema.safeParse(outputNoSpecifics);
        expect(result.success).toBe(true);
        expect(result.data.specifics).toEqual({});
      });
    });
  });

  describe('handle_collectible Node', () => {
    const mockState = {
      imageBase64: 'dGVzdGltYWdl', // 'testimage' in base64
      imageMime: 'image/jpeg',
      metadata: { camera: 'iPhone 15' },
      classification: 'specific_identifiable_object'
    };

    const validAIResponse = {
      category: {
        value: 'Pyrex',
        confidence: 0.95,
        reasoning: 'Clear Pyrex branding visible'
      },
      condition: {
        value: { rank: 4, label: 'Very Good' },
        confidence: 0.88
      },
      value: {
        value: { min: 35, max: 55, currency: 'USD' },
        confidence: 0.82
      },
      specifics: {
        pattern: {
          value: 'Butterprint',
          confidence: 0.92
        }
      }
    };

    test('returns skipped status when feature flag is disabled', async () => {
      process.env.ENABLE_COLLECTIBLES_AI = 'false';
      
      // Clear the module cache to pick up new env var
      jest.resetModules();
      
      // Re-mock dependencies
      jest.mock('../ai/langchain/agents', () => ({
        collectibleAgent: { invoke: jest.fn() }
      }));
      jest.mock('../logger', () => ({
        info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
      }));
      
      const handleCollectible = require('../ai/langgraph/nodes/handle_collectible');
      
      const result = await handleCollectible(mockState);
      
      expect(result.collectibleResult.status).toBe('skipped');
      expect(result.collectibleResult.reason).toContain('ENABLE_COLLECTIBLES_AI');
    });

    test('Valid Schema Test - processes valid AI response correctly', async () => {
      collectibleAgent.invoke.mockResolvedValueOnce({
        content: JSON.stringify(validAIResponse)
      });

      const result = await handle_collectible(mockState);

      expect(result.collectibleResult.status).toBe('success');
      expect(result.collectibleResult.collectibleData.cleanData.category).toBe('Pyrex');
      expect(result.collectibleResult.collectibleData.fullAnalysis.category.confidence).toBe(0.95);
      expect(result.error).toBeNull();
    });

    test('Invalid Schema Test - catches malformed JSON and returns failed status', async () => {
      collectibleAgent.invoke.mockResolvedValueOnce({
        content: 'This is not valid JSON at all'
      });

      const result = await handle_collectible(mockState);

      expect(result.collectibleResult.status).toBe('failed');
      expect(result.collectibleResult.error).toContain('JSON parse error');
      expect(result.collectibleResult.collectibleData).toBeNull();
    });

    test('Invalid Schema Test - catches schema validation errors', async () => {
      const invalidResponse = {
        category: { value: 'Pyrex', confidence: 0.9 }
        // Missing required fields: condition, value
      };

      collectibleAgent.invoke.mockResolvedValueOnce({
        content: JSON.stringify(invalidResponse)
      });

      const result = await handle_collectible(mockState);

      expect(result.collectibleResult.status).toBe('failed');
      expect(result.collectibleResult.error).toContain('Schema validation failed');
      expect(result.collectibleResult.collectibleData).toBeNull();
    });

    test('Low Confidence Test - processes low confidence response successfully', async () => {
      const lowConfidenceResponse = {
        category: {
          value: 'Unknown Vintage Bowl',
          confidence: 0.4,
          reasoning: 'Cannot identify brand clearly'
        },
        condition: {
          value: { rank: 2, label: 'Fair' },
          confidence: 0.35
        },
        value: {
          value: { min: 5, max: 100, currency: 'USD' },
          confidence: 0.2,
          reasoning: 'Very uncertain without identification'
        },
        specifics: {}
      };

      collectibleAgent.invoke.mockResolvedValueOnce({
        content: JSON.stringify(lowConfidenceResponse)
      });

      const result = await handle_collectible(mockState);

      // Low confidence is still valid - passes validation
      expect(result.collectibleResult.status).toBe('success');
      expect(result.collectibleResult.collectibleData.fullAnalysis.category.confidence).toBe(0.4);
      expect(result.collectibleResult.collectibleData.fullAnalysis.value.confidence).toBe(0.2);
      
      // Verify low confidence is flagged correctly
      expect(needsReview(result.collectibleResult.collectibleData.fullAnalysis.category.confidence)).toBe(true);
      expect(isSuggestionOnly(result.collectibleResult.collectibleData.fullAnalysis.value.confidence)).toBe(true);
    });

    test('Specifics Extraction - preserves specifics in both cleanData and fullAnalysis', async () => {
      const responseWithSpecifics = {
        ...validAIResponse,
        specifics: {
          pattern: { value: 'Butterprint', confidence: 0.92 },
          color: { value: 'Turquoise', confidence: 0.95 },
          year: { value: '1958', confidence: 0.7 }
        }
      };

      collectibleAgent.invoke.mockResolvedValueOnce({
        content: JSON.stringify(responseWithSpecifics)
      });

      const result = await handle_collectible(mockState);

      expect(result.collectibleResult.status).toBe('success');
      
      // Verify cleanData has just values
      expect(result.collectibleResult.collectibleData.cleanData.specifics.pattern).toBe('Butterprint');
      expect(result.collectibleResult.collectibleData.cleanData.specifics.color).toBe('Turquoise');
      expect(result.collectibleResult.collectibleData.cleanData.specifics.year).toBe('1958');
      
      // Verify fullAnalysis has confidence scores
      expect(result.collectibleResult.collectibleData.fullAnalysis.specifics.pattern.confidence).toBe(0.92);
      expect(result.collectibleResult.collectibleData.fullAnalysis.specifics.color.confidence).toBe(0.95);
      expect(result.collectibleResult.collectibleData.fullAnalysis.specifics.year.confidence).toBe(0.7);
    });

    test('handles unexpected errors gracefully', async () => {
      collectibleAgent.invoke.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await handle_collectible(mockState);

      expect(result.collectibleResult.status).toBe('failed');
      expect(result.collectibleResult.error).toBe('Network timeout');
      expect(result.error).toBe('Network timeout');
    });

    test('maintains backward compatibility with finalResult', async () => {
      collectibleAgent.invoke.mockResolvedValueOnce({
        content: JSON.stringify(validAIResponse)
      });

      const result = await handle_collectible(mockState);

      // Legacy finalResult should still be populated
      expect(result.finalResult).toBeDefined();
      expect(result.finalResult.caption).toContain('Pyrex');
      expect(result.finalResult.collectibleInsights).toBeDefined();
      expect(result.finalResult.collectibleInsights.category).toBe('Pyrex');
      expect(result.finalResult.classification).toBe('specific_identifiable_object');
    });
  });
});
