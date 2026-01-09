const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');
const { isE2EEnabled } = require('../config/e2eGate');
const { getRedisClient, setRedisValueWithTtl } = require('../lib/redis');

// Initialize Supabase client
// In production, missing SUPABASE_* or JWT_SECRET will fail fast via config validation.
const config = getConfig();
const supabase = createClient(config.supabase.url, config.supabase.anonKey);

function isLoopbackRequest(req) {
  const remote = req && req.socket ? req.socket.remoteAddress : undefined;
  const ip = req && req.ip ? req.ip : undefined;
  const candidates = [remote, ip].filter(Boolean).map(String);
  return candidates.some(addr => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1');
}

function normalizeUrlNoTrailingSlash(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
}

function tryParseUrl(url) {
  try {
    return new URL(String(url));
  } catch {
    return null;
  }
}

function expectedSupabaseIssuer(supabaseUrl) {
  // Supabase-issued JWTs use: iss = <projectOrigin>/auth/v1
  // We canonicalize the configured URL to an origin so we can safely accept
  // either a bare project URL or an accidental /auth/v1-suffixed config.
  const normalized = normalizeUrlNoTrailingSlash(supabaseUrl);
  const parsed = tryParseUrl(normalized);
  if (!parsed) return '';
  return `${parsed.origin}/auth/v1`;
}

function isIssuerForConfiguredSupabaseProject({ issuer, configuredSupabaseUrl }) {
  // Security: do NOT use substring matching. Parse URLs and require exact
  // origin match + exact expected auth issuer path.
  const expected = expectedSupabaseIssuer(configuredSupabaseUrl);
  const expectedUrl = tryParseUrl(expected);
  const issuerUrl = tryParseUrl(issuer);
  if (!expectedUrl || !issuerUrl) return false;

  const issuerPath = String(issuerUrl.pathname || '').replace(/\/+$/, '');
  const expectedPath = String(expectedUrl.pathname || '').replace(/\/+$/, '');

  return issuerUrl.origin === expectedUrl.origin && issuerPath === expectedPath;
}

function isStrictAuthenticatedAudience(aud) {
  // Supabase access tokens should use aud='authenticated'.
  // jsonwebtoken's audience option is an inclusion check; we additionally require
  // that the claim is exactly 'authenticated' to reduce spoofing surface.
  if (aud === 'authenticated') return true;
  if (Array.isArray(aud)) return aud.length === 1 && aud[0] === 'authenticated';
  return false;
}

/**
 * Middleware to verify Supabase JWT token and authenticate users
 * 
 * SECURITY ARCHITECTURE (Stateless JWT Bearer Token):
 * - Token MUST be provided in Authorization header as "Bearer <token>"
 * - This approach provides:
 *   - Stateless authentication (no server-side session storage)
 *   - CSRF immunity (tokens not sent automatically like cookies)
 *   - iOS/Mobile Safari compatibility (no ITP cookie blocking)
 *   - Modern API patterns (standard HTTP Authorization header)
 *   - Cross-origin deployments (no SameSite cookie issues)
 * 
 * SECURITY NOTES:
 * - Cookies are NOT supported (eliminates cookie/session split-brain issues)
 * - Query parameter tokens are NOT supported (security risk - logged in URLs)
 * - Token validation is handled by Supabase Auth (getUser API)
 * - Tokens are NEVER logged or exposed in error messages
 */

// E2E test user ID - hardcoded constant, never derived from user input
const E2E_TEST_USER_ID = '11111111-1111-4111-8111-111111111111';

async function authenticateToken(req, res, next) {
  // 0. Check for E2E test header (only in non-production)
  // This allows E2E tests to bypass Bearer token requirement if they send the special header
  if (isE2EEnabled() && isLoopbackRequest(req)) {
    const e2eHeader = req.headers['x-e2e-user-id'];
    // SECURITY: Compare against constant, and assign the CONSTANT (not user input) to req.user.id
    // This prevents any possibility of user-controlled data reaching the authenticated user object.
    if (e2eHeader === E2E_TEST_USER_ID) {
      req.user = {
        id: E2E_TEST_USER_ID, // Use constant, not e2eHeader
        email: 'admin@example.com',
        username: 'admin',
        role: 'admin'
      };
      req.authSource = 'e2e-header';
      return next();
    }
  }

  // REQUIRED: Extract Bearer token from Authorization header
  // This is the ONLY supported authentication method
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authorization header with Bearer token required' 
    });
  }

  const token = authHeader.slice(7).trim(); // Remove 'Bearer ' prefix
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    });
  }

  try {
    // 0. Check for E2E test token (only in non-production)
    if (isE2EEnabled() && isLoopbackRequest(req)) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (decoded.sub === '11111111-1111-4111-8111-111111111111') {
          req.user = {
            id: decoded.sub,
            email: decoded.email,
            username: decoded.username,
            role: decoded.role
          };
          req.authSource = 'e2e-test';
          return next();
        }
      } catch {
        // Not a valid E2E token, continue to Supabase check
      }
    }

    // If SUPABASE_JWT_SECRET is configured, verify JWT locally first.
    // Security: this is an *additional* validation step; Supabase Auth remains
    // the source of truth (revocation/session checks) via getUser().
    if (config?.supabase?.jwtSecret) {
      const configuredSupabaseUrl = config?.supabase?.url || process.env.SUPABASE_URL;
      const issuerExpected = expectedSupabaseIssuer(configuredSupabaseUrl);
      try {
        const decoded = jwt.verify(token, config.supabase.jwtSecret, {
          algorithms: ['HS256'],
          // We validate `iss` ourselves using URL parsing to handle the /auth/v1
          // suffix robustly and avoid false positives from string tricks.
          audience: 'authenticated'
        });

        const tokenIssuer = decoded && typeof decoded === 'object' ? decoded.iss : undefined;
        if (!isIssuerForConfiguredSupabaseProject({ issuer: tokenIssuer, configuredSupabaseUrl })) {
          const err = new Error('JWT issuer mismatch');
          err.name = 'JWT_ISSUER_MISMATCH';
          throw err;
        }

        const tokenAud = decoded && typeof decoded === 'object' ? decoded.aud : undefined;
        if (!isStrictAuthenticatedAudience(tokenAud)) {
          const err = new Error('JWT audience mismatch');
          err.name = 'JWT_AUDIENCE_MISMATCH';
          throw err;
        }
      } catch (verifyErr) {
        if (process.env.AUTH_DEBUG_LOGS) {
          console.warn('[auth] Invalid token', {
            reason: verifyErr && verifyErr.name ? verifyErr.name : 'JWT_VERIFY_FAILED',
            issuerExpected: issuerExpected || '(missing)',
          });
        }
        return res.status(403).json({ success: false, error: 'Invalid token' });
      }
    }

    let user;
    let error;

    // Cache validated Supabase user profiles in Redis to avoid repeated network calls.
    // SECURITY: Never use the raw token as a cache key.
    const redisClient = getRedisClient();
    if (redisClient) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const cacheKey = `auth:profile:${tokenHash}`;

      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Minimal validation to avoid throwing on malformed cache entries.
          if (parsed && typeof parsed === 'object' && parsed.id && parsed.email) {
            user = parsed;
          }
        }
      } catch {
        // Fail-open: if Redis is unavailable or cache is malformed, fall back to Supabase.
      }

      if (!user) {
        // Verify token using Supabase Auth
        const result = await supabase.auth.getUser(token);
        user = result?.data?.user;
        error = result?.error;

        if (!error && user) {
          const minimizedUser = {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            app_metadata: user.app_metadata
          };

          try {
            await setRedisValueWithTtl(redisClient, cacheKey, 300, JSON.stringify(minimizedUser));
          } catch {
            // Fail-open: do not block auth if Redis write fails.
          }
        }
      }
    } else {
      // Verify token using Supabase Auth
      const result = await supabase.auth.getUser(token);
      user = result?.data?.user;
      error = result?.error;
    }

    if (error || !user) {
      if (process.env.AUTH_DEBUG_LOGS) {
        const origin = req.headers.origin;
        const ua = req.headers['user-agent'];
        const hasAuthHeader = Boolean(req.headers.authorization);
        const tokenLen = typeof token === 'string' ? token.length : 0;
        const backendSupabaseUrl = config?.supabase?.url || process.env.SUPABASE_URL;

        const tokenMeta = (() => {
          try {
            if (typeof token !== 'string') return { parse: 'failed' };
            const parts = token.split('.');
            if (parts.length !== 3) return { parse: 'failed' };

            const payloadB64Url = parts[1];
            const payloadB64 = payloadB64Url.replace(/-/g, '+').replace(/_/g, '/');
            const padded = payloadB64.padEnd(Math.ceil(payloadB64.length / 4) * 4, '=');
            const payloadJson = Buffer.from(padded, 'base64').toString('utf8');
            const payload = JSON.parse(payloadJson);

            return {
              iss: payload?.iss,
              aud: payload?.aud,
              sub: payload?.sub,
              exp: payload?.exp
            };
          } catch {
            return { parse: 'failed' };
          }
        })();

        console.warn('[auth] Invalid token', {
          origin,
          ua,
          hasAuthHeader,
          tokenLen,
          tokenMeta,
          backendSupabaseUrl: normalizeUrlNoTrailingSlash(backendSupabaseUrl)
        });
      }
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }

    // Map Supabase user to app user structure
    req.user = {
      id: user.id,
      email: user.email,
      // Use metadata for username/role if available, otherwise fallback
      username: user.user_metadata?.username || user.email.split('@')[0],
      // SECURITY: Use app_metadata for role (server-controlled, not client-writable)
      // app_metadata can only be modified via Service Role Key
      role: user.app_metadata?.role || 'user'
    };
    req.authSource = 'bearer';

    next();
  } catch (err) {
    // SECURITY: Never log the actual token or include it in error responses
    console.error('Auth error:', err.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Middleware to require specific roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }
    
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole
};