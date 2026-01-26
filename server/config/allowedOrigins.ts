/**
 * CORS Origin Configuration (Centralized)
 *
 * This module provides strict, explicit CORS origin allowlisting for the backend API and all image/thumbnail routes.
 *
 * === Default Dev Origins ===
 * - http://localhost:5173 (Vite dev server)
 * - http://localhost:3000 (legacy dev server)
 * - http://localhost:5174 (alt dev port)
 * - http://127.0.0.1:5173 (Vite dev server via IPv4)
 * - http://127.0.0.1:5174 (alt dev port via IPv4)
 *
 * === Production Configuration ===
 * - Set FRONTEND_ORIGIN to your deployed frontend (e.g. https://react-photo-app-eta.vercel.app) in Railway env vars.
 * - Optionally set ALLOWED_ORIGINS (comma-separated) for multiple frontends. If set, defaults are NOT included.
 *
 * === How it works ===
 * - If ALLOWED_ORIGINS is set, only those origins (plus FRONTEND_ORIGIN, if set) are allowed.
 * - If ALLOWED_ORIGINS is not set, defaults + FRONTEND_ORIGIN are allowed.
 * - No wildcards (*) are ever used. This is intentional for security (credentials: true).
 * - Requests from unknown origins get no CORS headers or are rejected (never a wildcard). This is by design.
 *
 * === Where this is used ===
 * - Backend CORS middleware (server/server.js)
 * - All image/thumbnail routes (via imageAuth and display.js)
 *
 * === Security ===
 * - Only explicitly allowed origins receive CORS headers.
 * - Credentials (cookies, Authorization) are supported.
 * - No regex, no IP ranges, no *.
 *
 * See server/README.md for full documentation and troubleshooting.
 */

const DEFAULT_ORIGINS = [
  'http://localhost:3000',   // Common dev server port
  'http://localhost:5173',   // Vite default port
  'http://localhost:5174',   // Vite alternative port
  'http://127.0.0.1:5173',   // IPv4 loopback (Playwright/baseURL)
  'http://127.0.0.1:5174',   // IPv4 loopback alternative
  'https://justmypeeps.org', // Production domain
  'https://www.justmypeeps.org' // Production domain with www
];

/**
 * Normalize an origin string so it matches the browser Origin header format.
 *
 * Important: The browser Origin header never includes a trailing slash.
 * If an env var contains one (e.g. https://app.example.com/), an exact
 * string comparison will fail and CORS will be rejected.
 */
function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function isProbablyIpHost(hostname) {
  if (!hostname) return false;
  // IPv6 (very rough): contains ':'
  if (hostname.includes(':')) return true;
  // IPv4
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function addSingleOriginWithWwwVariants(origins, rawOrigin) {
  const normalized = normalizeOrigin(rawOrigin);
  if (!normalized) return;

  origins.add(normalized);

  // Heuristic: only add www-variants for apex domains (example.com).
  // Avoid adding nonsense variants for localhost/IPs or already-subdomained hosts.
  try {
    const url = new URL(normalized);
    const hostname = url.hostname;

    if (!hostname || hostname === 'localhost' || isProbablyIpHost(hostname)) return;

    if (hostname.startsWith('www.')) {
      const withoutWww = hostname.slice(4);
      if (!withoutWww) return;
      const withoutUrl = new URL(url.toString());
      withoutUrl.hostname = withoutWww;
      origins.add(withoutUrl.origin);
      return;
    }

    const labels = hostname.split('.').filter(Boolean);
    if (labels.length !== 2) return;

    const withUrl = new URL(url.toString());
    withUrl.hostname = `www.${hostname}`;
    origins.add(withUrl.origin);
  } catch {
    // If it's not a valid URL, just keep the normalized value.
  }
}

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
      .map((value) => normalizeOrigin(value))
      .filter(Boolean); // Remove empty strings from trailing commas

    // Still support legacy env vars alongside explicit config
    // Expand any apex domain entries to include www variants.
    const origins = new Set();
    explicit.forEach((value) => addSingleOriginWithWwwVariants(origins, value));
    
    // FRONTEND_ORIGIN is always respected (simple single-origin config)
    if (process.env.FRONTEND_ORIGIN) {
      addSingleOriginWithWwwVariants(origins, process.env.FRONTEND_ORIGIN);
    }
    
    if (process.env.CLIENT_ORIGIN) {
      addSingleOriginWithWwwVariants(origins, process.env.CLIENT_ORIGIN);
    }
    
    if (process.env.CLIENT_ORIGINS) {
      process.env.CLIENT_ORIGINS.split(',')
        .map((value) => normalizeOrigin(value))
        .filter(Boolean)
        .forEach((value) => addSingleOriginWithWwwVariants(origins, value));
    }

    // Legacy compatibility: CORS_ORIGIN (comma-separated)
    // NOTE: This is kept for backward compatibility with older Railway env setups.
    if (process.env.CORS_ORIGIN) {
      process.env.CORS_ORIGIN.split(',')
        .map((value) => normalizeOrigin(value))
        .filter(Boolean)
        .forEach((value) => addSingleOriginWithWwwVariants(origins, value));
    }
    
    return Array.from(origins);
  }
  
  // Fallback: use defaults only when no explicit config exists
  const origins = new Set(DEFAULT_ORIGINS.map((o) => normalizeOrigin(o)).filter(Boolean));
  
  // FRONTEND_ORIGIN (simple single-origin config for production frontend)
  if (process.env.FRONTEND_ORIGIN) {
    addSingleOriginWithWwwVariants(origins, process.env.FRONTEND_ORIGIN);
  }
  
  // Backward compatibility: CLIENT_ORIGIN (single origin)
  const envOrigin = process.env.CLIENT_ORIGIN;
  if (envOrigin) {
    addSingleOriginWithWwwVariants(origins, envOrigin);
  }
  
  // Backward compatibility: CLIENT_ORIGINS (multi-origin)
  if (process.env.CLIENT_ORIGINS) {
    process.env.CLIENT_ORIGINS.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => addSingleOriginWithWwwVariants(origins, value));
  }

  // Backward compatibility: CORS_ORIGIN (multi-origin)
  // Historically used in this repo (see server/.env and env validation).
  if (process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN.split(',')
      .map((value) => normalizeOrigin(value))
      .filter(Boolean)
      .forEach((value) => addSingleOriginWithWwwVariants(origins, value));
  }
  
  return Array.from(origins);
}

/**
 * Resolve an incoming request Origin against the allowlist.
 * 
 * SECURITY: This function is used when manually setting Access-Control-Allow-Origin
 * headers (e.g., in image serving routes). It maintains consistency with the main
 * CORS policy and guards against misconfiguration.
 * 
 * Security behavior:
 * - Returns the origin unchanged if it's explicitly in the allowlist
 * - Returns null if the origin is not allowed (rejected)
 * - Returns null for undefined/null origins (server-to-server requests)
 * - CRITICAL: Returns null for the literal string "null" origin
 *   (Browsers send Origin: null in certain privacy contexts like sandboxed iframes,
 *    file:// URLs, or cross-origin redirects. We must never set Access-Control-Allow-Origin
 *    to "null" when credentials are involved, as this is a CodeQL/OWASP security concern.)
 * 
 * Note: Server-to-server requests with no Origin are typically allowed by the CORS
 * middleware (via callback(null, origin) where origin is undefined), but for manual
 * header-setting we should not set any origin header.
 * 
 * @param {string|undefined} requestOrigin - The Origin header from the request
 * @returns {string|null} The origin to use in Access-Control-Allow-Origin, or null if not allowed
 */
function resolveAllowedOrigin(requestOrigin) {
  // SECURITY: Guard against missing origin or the literal "null" string.
  // Browsers send Origin: null in privacy-sensitive contexts (sandboxed iframes,
  // file:// URLs, cross-origin redirects). Setting Access-Control-Allow-Origin
  // to "null" with credentials is a security misconfiguration (CodeQL CWE-942).
  if (!requestOrigin || requestOrigin === 'null') {
    if (process.env.NODE_ENV !== 'test') {
      console.log('[CORS DEBUG]', {
        requestOrigin,
        resolvedOrigin: null,
        allowedOrigins: getAllowedOrigins(),
        path: undefined // req not available here
      });
    }
    return null;
  }

  const allowedOrigins = getAllowedOrigins();
  let resolved = null;
  if (allowedOrigins.includes(requestOrigin)) {
    resolved = requestOrigin;
  }
  if (process.env.NODE_ENV !== 'test') {
    console.log('[CORS DEBUG]', {
      requestOrigin,
      resolvedOrigin: resolved,
      allowedOrigins,
      path: undefined // req not available here
    });
  }
  return resolved;
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
    if (process.env.NODE_ENV !== 'test') {
      console.log('[CORS DEBUG]', {
        requestOrigin,
        allowedOrigins: getAllowedOrigins(),
        allowed: true,
        path: undefined // req not available here
      });
    }
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  const allowed = allowedOrigins.includes(requestOrigin);
  if (process.env.NODE_ENV !== 'test') {
    console.log('[CORS DEBUG]', {
      requestOrigin,
      allowedOrigins,
      allowed,
      path: undefined // req not available here
    });
  }
  return allowed;
}

module.exports = {
  getAllowedOrigins,
  resolveAllowedOrigin,
  isOriginAllowed
};

export {};
