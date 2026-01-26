/**
 * Feature Flags Utility for Collectibles Module
 * 
 * This utility controls feature availability for the Smart Collector module.
 * Following the "Sidecar Architecture" pattern - if collectibles features fail,
 * the main photo gallery remains fully operational.
 * 
 * @module server/utils/featureFlags
 */

/**
 * Feature flag for collectibles database operations.
 * When disabled, DB operations will throw or return no-op.
 */
export const ENABLE_COLLECTIBLES_DB = process.env.ENABLE_COLLECTIBLES_DB === 'true';

/**
 * Feature flag for collectibles AI analysis.
 * Placeholder for Sprint 2 - AI valuation and identification.
 */
export const ENABLE_COLLECTIBLES_AI = process.env.ENABLE_COLLECTIBLES_AI === 'true';

/**
 * Feature flag for collectibles UI components (frontend only).
 * Defined here for documentation and shared constant access.
 */
export const VITE_ENABLE_COLLECTIBLES_UI = process.env.VITE_ENABLE_COLLECTIBLES_UI === 'true';

/**
 * Check if collectibles database operations are enabled.
 */
export function isCollectiblesDbEnabled(): boolean {
  return ENABLE_COLLECTIBLES_DB;
}

/**
 * Check if collectibles AI analysis is enabled.
 */
export function isCollectiblesAiEnabled(): boolean {
  return ENABLE_COLLECTIBLES_AI;
}

/**
 * Check if collectibles UI is enabled.
 */
export function isCollectiblesUiEnabled(): boolean {
  return VITE_ENABLE_COLLECTIBLES_UI;
}

/**
 * Guard function that throws if collectibles DB is disabled.
 * Use at the start of service methods to enforce feature flag.
 */
export function assertCollectiblesDbEnabled(): void {
  if (!ENABLE_COLLECTIBLES_DB) {
    const error = new Error(
      'Collectibles database operations are disabled. Set ENABLE_COLLECTIBLES_DB=true to enable.'
    ) as Error & { code?: string };
    error.code = 'FEATURE_DISABLED';
    throw error;
  }
}

/**
 * Guard function that throws if collectibles AI is disabled.
 * Use at the start of AI-related service methods.
 */
export function assertCollectiblesAiEnabled(): void {
  if (!ENABLE_COLLECTIBLES_AI) {
    const error = new Error(
      'Collectibles AI analysis is disabled. Set ENABLE_COLLECTIBLES_AI=true to enable.'
    ) as Error & { code?: string };
    error.code = 'FEATURE_DISABLED';
    throw error;
  }
}