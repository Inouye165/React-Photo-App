/**
 * Feature Flags Configuration
 * 
 * Centralizes feature flag logic for testability and maintainability.
 * All feature flags should be defined here and imported by components.
 */

/**
 * Controls whether the collectibles UI is enabled.
 * When true, shows the Collectibles tab and related UI elements in EditPage.
 */
export const COLLECTIBLES_UI_ENABLED = import.meta.env.VITE_ENABLE_COLLECTIBLES_UI === 'true';
