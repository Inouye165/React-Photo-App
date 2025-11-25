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
 * - CLIENT_ORIGIN: Legacy single origin support (backward compatibility)
 * - CLIENT_ORIGINS: Legacy multi-origin support (backward compatibility)
 * 
 * Default behavior:
 * - Includes common localhost ports for local development (5173, 3000, 5174)
 * - Does NOT allow arbitrary LAN IPs by default (security by design)
 * - All origins must be explicitly configured for production environments
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

module.exports = {
  getAllowedOrigins
};
