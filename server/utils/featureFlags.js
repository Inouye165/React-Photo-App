/**
 * Feature Flags Utility for Collectibles Module
 * 
 * This utility controls feature availability for the Smart Collector module.
 * Following the "Sidecar Architecture" pattern - if collectibles features fail,
 * the main photo gallery remains fully operational.
 * 
 * @module server/utils/featureFlags
 */

'use strict';

/**
 * Feature flag for collectibles database operations.
 * When disabled, DB operations will throw or return no-op.
 * @type {boolean}
 */
const ENABLE_COLLECTIBLES_DB = process.env.ENABLE_COLLECTIBLES_DB === 'true';

/**
 * Feature flag for collectibles AI analysis.
 * Placeholder for Sprint 2 - AI valuation and identification.
 * @type {boolean}
 */
const ENABLE_COLLECTIBLES_AI = process.env.ENABLE_COLLECTIBLES_AI === 'true';

/**
 * Feature flag for collectibles UI components (frontend only).
 * Defined here for documentation and shared constant access.
 * @type {boolean}
 */
const VITE_ENABLE_COLLECTIBLES_UI = process.env.VITE_ENABLE_COLLECTIBLES_UI === 'true';

/**
 * Check if collectibles database operations are enabled.
 * @returns {boolean} True if ENABLE_COLLECTIBLES_DB is set to 'true'
 */
function isCollectiblesDbEnabled() {
  return ENABLE_COLLECTIBLES_DB;
}

/**
 * Check if collectibles AI analysis is enabled.
 * @returns {boolean} True if ENABLE_COLLECTIBLES_AI is set to 'true'
 */
function isCollectiblesAiEnabled() {
  return ENABLE_COLLECTIBLES_AI;
}

/**
 * Check if collectibles UI is enabled.
 * @returns {boolean} True if VITE_ENABLE_COLLECTIBLES_UI is set to 'true'
 */
function isCollectiblesUiEnabled() {
  return VITE_ENABLE_COLLECTIBLES_UI;
}

/**
 * Guard function that throws if collectibles DB is disabled.
 * Use at the start of service methods to enforce feature flag.
 * @throws {Error} When ENABLE_COLLECTIBLES_DB is not 'true'
 */
function assertCollectiblesDbEnabled() {
  if (!ENABLE_COLLECTIBLES_DB) {
    const error = new Error('Collectibles database operations are disabled. Set ENABLE_COLLECTIBLES_DB=true to enable.');
    error.code = 'FEATURE_DISABLED';
    throw error;
  }
}

/**
 * Guard function that throws if collectibles AI is disabled.
 * Use at the start of AI-related service methods.
 * @throws {Error} When ENABLE_COLLECTIBLES_AI is not 'true'
 */
function assertCollectiblesAiEnabled() {
  if (!ENABLE_COLLECTIBLES_AI) {
    const error = new Error('Collectibles AI analysis is disabled. Set ENABLE_COLLECTIBLES_AI=true to enable.');
    error.code = 'FEATURE_DISABLED';
    throw error;
  }
}

module.exports = {
  // Constants
  ENABLE_COLLECTIBLES_DB,
  ENABLE_COLLECTIBLES_AI,
  VITE_ENABLE_COLLECTIBLES_UI,
  
  // Check functions
  isCollectiblesDbEnabled,
  isCollectiblesAiEnabled,
  isCollectiblesUiEnabled,
  
  // Guard functions
  assertCollectiblesDbEnabled,
  assertCollectiblesAiEnabled
};
