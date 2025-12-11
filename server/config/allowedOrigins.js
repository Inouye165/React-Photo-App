/**
 * CORS Origin Configuration
 * 
 * This module provides strict, explicit CORS origin allowlisting.
 * 
 * Security Design:
 * - Explicit allowlist (no regex patterns or IP range wildcards)
 * - Defense in depth: prevents DNS rebinding attacks
 * - Principle of least privilege: only explicitly allowed origins accepted
 * 
 * Configuration:
 * - ALLOWED_ORIGINS: Comma-separated list of allowed origins (production use)
 *   Example: "https://app.example.com,https://staging.example.com"
 * - FRONTEND_ORIGIN: Single frontend URL for simple deployments (e.g., Vercel)
 *   Example: "https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app"
 * - CLIENT_ORIGIN: Legacy single origin support (backward compatibility)
 * - CLIENT_ORIGINS: Legacy multi-origin support (backward compatibility)
 * 
 * Default behavior:
 * - Includes common localhost ports for local development (5173, 3000, 5174)
 * - Does NOT allow arbitrary LAN IPs by default (security by design)
 * - All origins must be explicitly configured for production environments
 * 
 * Priority (all are merged when present):
 * 1. ALLOWED_ORIGINS (if set, defaults are NOT included for security)
 * 2. FRONTEND_ORIGIN (always added if set)
 * 3. CLIENT_ORIGIN / CLIENT_ORIGINS (legacy backward compatibility)
 * 4. DEFAULT_ORIGINS (only when ALLOWED_ORIGINS is not set)
 */

const DEFAULT_ORIGINS = [
  'http://localhost:3000',   // Common dev server port
  'http://localhost:5173',   // Vite default port
  'http://localhost:5174'    // Vite alternative port
];

/**
 * Parse and return the complete list of allowed CORS origins.
 * 
 * Security note: When ALLOWED_ORIGINS is explicitly set, defaults are NOT included.
 * This prevents accidental security holes when moving to production.
 * 
 * FRONTEND_ORIGIN is always added if set, regardless of ALLOWED_ORIGINS.
 * This supports simple Vercel/Netlify deployments without complex config.
 * 
 * @returns {string[]} Array of allowed origin URLs
 */
function getAllowedOrigins() {
  // If explicitly configured, use ONLY those origins (no defaults)
  if (process.env.ALLOWED_ORIGINS) {
    const explicit = process.env.ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean); // Remove empty strings from trailing commas
    
    // Still support legacy env vars alongside explicit config
    const origins = new Set(explicit);
    
    // FRONTEND_ORIGIN is always respected (simple single-origin config)
    if (process.env.FRONTEND_ORIGIN) {
      origins.add(process.env.FRONTEND_ORIGIN.trim());
    }
    
    if (process.env.CLIENT_ORIGIN) {
      origins.add(process.env.CLIENT_ORIGIN.trim());
    }
    
    if (process.env.CLIENT_ORIGINS) {
      process.env.CLIENT_ORIGINS.split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => origins.add(value));
    }
    
    return Array.from(origins);
  }
  
  // Fallback: use defaults only when no explicit config exists
  const origins = new Set(DEFAULT_ORIGINS);
  
  // FRONTEND_ORIGIN (simple single-origin config for production frontend)
  if (process.env.FRONTEND_ORIGIN) {
    origins.add(process.env.FRONTEND_ORIGIN.trim());
  }
  
  // Backward compatibility: CLIENT_ORIGIN (single origin)
  const envOrigin = process.env.CLIENT_ORIGIN;
  if (envOrigin) {
    origins.add(envOrigin.trim());
  }
  
  // Backward compatibility: CLIENT_ORIGINS (multi-origin)
  if (process.env.CLIENT_ORIGINS) {
    process.env.CLIENT_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => origins.add(value));
  }
  
  return Array.from(origins);
}

/**
 * Resolve an incoming request Origin against the allowlist.
 * 
 * Security behavior:
 * - Returns the origin unchanged if it's explicitly in the allowlist
 * - Returns null if the origin is not allowed (rejected)
 * - Returns null for undefined/null origins (server-to-server requests)
 *   Note: Server-to-server requests with no Origin are typically allowed
 *   by the CORS middleware (via callback(null, origin) where origin is undefined),
 *   but for manual header-setting we should not set any origin header.
 * 
 * Use this helper when manually setting Access-Control-Allow-Origin headers
 * (e.g., in image serving routes) to ensure consistency with the main CORS policy.
 * 
 * @param {string|undefined} requestOrigin - The Origin header from the request
 * @returns {string|null} The origin to use in Access-Control-Allow-Origin, or null if not allowed
 */
function resolveAllowedOrigin(requestOrigin) {
  // No origin provided (server-to-server, curl, etc.)
  // Don't set CORS header for these requests
  if (!requestOrigin) {
    return null;
  }
  
  const allowedOrigins = getAllowedOrigins();
  
  // Only return the origin if it's explicitly in the allowlist
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  
  // Origin not in allowlist - rejected
  return null;
}

/**
 * Check if an origin is allowed.
 * 
 * @param {string|undefined} requestOrigin - The Origin header from the request
 * @returns {boolean} True if the origin is allowed or not provided
 */
function isOriginAllowed(requestOrigin) {
  // No origin (server-to-server) is typically allowed
  if (!requestOrigin) {
    return true;
  }
  
  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(requestOrigin);
}

module.exports = {
  getAllowedOrigins,
  resolveAllowedOrigin,
  isOriginAllowed
};
