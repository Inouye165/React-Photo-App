/**
 * AI Configuration Constants
 * 
 * Centralized configuration for AI confidence thresholds and behavior.
 * Used by the Smart Collector module to determine how to present AI analysis results.
 * 
 * @module server/config/aiConfig
 */

'use strict';

/**
 * Confidence thresholds for AI analysis results.
 * These determine how the UI presents AI-generated data to users.
 * 
 * @constant
 * @type {Object}
 * @property {number} HIGH - High confidence (≥0.9). Results shown as definitive.
 * @property {number} REVIEW - Review threshold (≥0.8). Below this, UI shows "Check this" indicator.
 * @property {number} LOW - Low confidence (≥0.5). Below this, value is shown as "Suggestion" only.
 */
const AI_CONFIDENCE = Object.freeze({
  HIGH: 0.9,
  REVIEW: 0.8,
  LOW: 0.5
});

/**
 * Get human-readable confidence level label
 * @param {number} confidence - Confidence score between 0 and 1
 * @returns {'high' | 'review' | 'low' | 'very_low'} Confidence level label
 */
function getConfidenceLevel(confidence) {
  if (confidence >= AI_CONFIDENCE.HIGH) return 'high';
  if (confidence >= AI_CONFIDENCE.REVIEW) return 'review';
  if (confidence >= AI_CONFIDENCE.LOW) return 'low';
  return 'very_low';
}

/**
 * Check if confidence score requires user review
 * @param {number} confidence - Confidence score between 0 and 1
 * @returns {boolean} True if confidence is below REVIEW threshold
 */
function needsReview(confidence) {
  return confidence < AI_CONFIDENCE.REVIEW;
}

/**
 * Check if confidence score indicates suggestion-only data
 * @param {number} confidence - Confidence score between 0 and 1
 * @returns {boolean} True if confidence is below LOW threshold
 */
function isSuggestionOnly(confidence) {
  return confidence < AI_CONFIDENCE.LOW;
}

module.exports = {
  AI_CONFIDENCE,
  getConfidenceLevel,
  needsReview,
  isSuggestionOnly
};
