/**
 * Cookie Configuration for Authentication
 * 
 * This module centralizes cookie configuration for auth tokens to ensure
 * consistent behavior across set and clear operations.
 * 
 * Cross-Origin Cookie Requirements:
 * When the frontend and backend are on different origins (e.g., localhost:5173 
 * talking to web-production.railway.app), cookies must be configured with:
 * - SameSite=None (allows cross-origin cookie transmission)
 * - Secure=true (required by browsers when SameSite=None)
 * 
 * Configuration via Environment Variables:
 * - COOKIE_SAME_SITE: Override the SameSite attribute ('none', 'lax', or 'strict')
 *   - For cross-origin deployments, set to 'none'
 *   - If not set, defaults to 'lax' (works for same-origin)
 * 
 * - NODE_ENV: Affects the 'secure' flag
 *   - In production OR when SameSite=None: secure=true
 *   - In development with SameSite!=None: secure=false
 * 
 * Local Development:
 * - Frontend at localhost:5173, backend at localhost:3001 → same origin behavior
 * - Default SameSite=Lax, Secure=false works fine
 * 
 * Cross-Origin Production (Railway):
 * - Set COOKIE_SAME_SITE=none in Railway environment
 * - Cookie will be: SameSite=None; Secure; HttpOnly
 */

const COOKIE_NAME = 'authToken';
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Determine the SameSite value based on environment configuration.
 * 
 * @returns {'none' | 'lax' | 'strict'} The SameSite attribute value
 */
function getSameSiteValue() {
  const envValue = process.env.COOKIE_SAME_SITE;
  
  if (envValue) {
    // Normalize to lowercase for consistent comparison
    const normalized = envValue.toLowerCase().trim();
    
    // Enforce production-only SameSite=None to prevent confusing non-prod behavior
    // and align with the deployment model where cross-origin cookies are only
    // expected/required in production.
    if (normalized === 'none' && process.env.NODE_ENV !== 'production') {
      console.warn(
        `[cookieConfig] COOKIE_SAME_SITE=none ignored because NODE_ENV is not production. ` +
          `Defaulting to 'lax'.`
      );
      return 'lax';
    }

    // Validate the value
    if (['none', 'lax', 'strict'].includes(normalized)) {
      return normalized;
    }
    
    // Warn about invalid value and fall back to default
    console.warn(
      `[cookieConfig] Invalid COOKIE_SAME_SITE value: "${envValue}". ` +
      `Must be 'none', 'lax', or 'strict'. Defaulting to 'lax'.`
    );
  }
  
  // Default: 'lax' works for same-origin setups
  // For cross-origin, user must explicitly set COOKIE_SAME_SITE=none
  return 'lax';
}

/**
 * Determine the Secure flag based on environment and SameSite value.
 * 
 * CRITICAL: When SameSite=None, Secure MUST be true (browser requirement).
 * 
 * @param {string} sameSiteValue - The SameSite value being used
 * @returns {boolean} Whether the Secure flag should be set
 */
function getSecureFlag(_sameSiteValue) {
  // Policy: Secure cookies are only used in production.
  // (SameSite=None is also production-only; when it is used, Secure must be true.)
  return process.env.NODE_ENV === 'production';
}

/**
 * Get the complete cookie options for setting the auth cookie.
 * 
 * @returns {object} Cookie options compatible with res.cookie()
 */
function getAuthCookieOptions() {
  const sameSite = getSameSiteValue();
  const secure = getSecureFlag(sameSite);
  
  return {
    httpOnly: true,       // Prevent JavaScript access (XSS protection)
    secure: secure,       // HTTPS only (required for SameSite=None)
    sameSite: sameSite,   // Cross-origin policy
    maxAge: COOKIE_MAX_AGE,
    path: '/'
  };
}

/**
 * Get the cookie options for clearing the auth cookie.
 * 
 * IMPORTANT: clearCookie options must match the options used when setting
 * the cookie, otherwise the browser won't recognize which cookie to clear.
 * 
 * @returns {object} Cookie options compatible with res.clearCookie()
 */
function getClearCookieOptions() {
  const sameSite = getSameSiteValue();
  const secure = getSecureFlag(sameSite);
  
  return {
    httpOnly: true,
    secure: secure,
    sameSite: sameSite,
    path: '/'
    // Note: maxAge is not needed for clearCookie
  };
}

module.exports = {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  getAuthCookieOptions,
  getClearCookieOptions,
  // Export internals for testing
  getSameSiteValue,
  getSecureFlag
};

export {};
