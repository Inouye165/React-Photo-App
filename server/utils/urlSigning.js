const crypto = require('crypto');

/**
 * URL Signing Utility for Secure Thumbnail Access
 * 
 * This module implements HMAC-based URL signing to enable secure, time-limited
 * access to thumbnail images without requiring cookies or Authorization headers.
 * 
 * Security properties:
 * - HMAC-SHA256 signature prevents tampering
 * - Expiration timestamp prevents indefinite reuse
 * - Signature includes the resource path to prevent substitution attacks
 * - Constant-time comparison prevents timing attacks
 * 
 * @module urlSigning
 */

// Get signing secret from environment, with secure fallback for development
const SIGNING_SECRET = process.env.THUMBNAIL_SIGNING_SECRET || process.env.JWT_SECRET;

if (!SIGNING_SECRET) {
  console.warn('[urlSigning] WARNING: No THUMBNAIL_SIGNING_SECRET or JWT_SECRET found. Using insecure fallback.');
  console.warn('[urlSigning] Set THUMBNAIL_SIGNING_SECRET in production for security.');
}

// Use fallback only in non-production environments
const SECRET = SIGNING_SECRET || (process.env.NODE_ENV === 'test' ? 'test-signing-secret' : null);

if (!SECRET) {
  throw new Error('THUMBNAIL_SIGNING_SECRET or JWT_SECRET required in production');
}

/**
 * Default TTL for signed URLs (15 minutes)
 * Short enough to limit exposure window, long enough for normal browsing
 */
const DEFAULT_TTL_SECONDS = 15 * 60;

/**
 * Generate HMAC-SHA256 signature for a thumbnail URL
 * 
 * The signature is computed over:
 * - Resource path (e.g., "thumbnails/abc123.jpg")
 * - Expiration timestamp
 * 
 * This prevents:
 * - Tampering with the path (e.g., changing the hash)
 * - Tampering with the expiration time
 * - Using the signature for different resources
 * 
 * @param {string} hash - Thumbnail hash (filename without extension)
 * @param {number} expiresAt - Unix timestamp (seconds) when URL expires
 * @returns {string} Base64url-encoded signature
 */
function generateSignature(hash, expiresAt) {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Hash must be a non-empty string');
  }
  if (!expiresAt || typeof expiresAt !== 'number' || expiresAt <= 0) {
    throw new Error('expiresAt must be a positive number (Unix timestamp)');
  }

  // Construct the message to sign: resource path + expiration
  const message = `thumbnails/${hash}.jpg:${expiresAt}`;
  
  // Generate HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(message);
  const signature = hmac.digest('base64url');
  
  return signature;
}

/**
 * Sign a thumbnail URL with expiration and signature
 * 
 * Returns an object containing the query parameters needed to authenticate
 * the thumbnail request without cookies or headers.
 * 
 * @param {string} hash - Thumbnail hash (filename without extension)
 * @param {number} [ttlSeconds=900] - Time-to-live in seconds (default: 15 minutes)
 * @returns {{sig: string, exp: number}} Query parameters for signed URL
 * 
 * @example
 * const params = signThumbnailUrl('abc123', 900);
 * const url = `/display/thumbnails/abc123.jpg?sig=${params.sig}&exp=${params.exp}`;
 */
function signThumbnailUrl(hash, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Hash must be a non-empty string');
  }
  if (typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
    throw new Error('TTL must be a positive number');
  }

  // Calculate expiration timestamp (seconds since epoch)
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;
  
  // Generate signature
  const signature = generateSignature(hash, expiresAt);
  
  return {
    sig: signature,
    exp: expiresAt
  };
}

/**
 * Verify a signed thumbnail URL
 * 
 * Validates that:
 * 1. The signature matches the expected HMAC for the given hash and expiration
 * 2. The URL has not expired
 * 
 * Uses constant-time comparison to prevent timing attacks.
 * 
 * @param {string} hash - Thumbnail hash from URL path
 * @param {string} providedSig - Signature from query parameter
 * @param {number|string} providedExp - Expiration timestamp from query parameter
 * @returns {{valid: boolean, reason?: string}} Validation result
 * 
 * @example
 * const result = verifyThumbnailSignature('abc123', req.query.sig, req.query.exp);
 * if (!result.valid) {
 *   return res.status(403).json({ error: 'Invalid signature' });
 * }
 */
function verifyThumbnailSignature(hash, providedSig, providedExp) {
  // Validate inputs
  if (!hash || typeof hash !== 'string') {
    return { valid: false, reason: 'Invalid hash' };
  }
  if (!providedSig || typeof providedSig !== 'string') {
    return { valid: false, reason: 'Missing signature' };
  }
  if (!providedExp) {
    return { valid: false, reason: 'Missing expiration' };
  }

  // Parse expiration timestamp
  const expiresAt = typeof providedExp === 'number' ? providedExp : parseInt(providedExp, 10);
  if (isNaN(expiresAt) || expiresAt <= 0) {
    return { valid: false, reason: 'Invalid expiration timestamp' };
  }

  // Check expiration (fail fast)
  const now = Math.floor(Date.now() / 1000);
  if (now >= expiresAt) {
    return { valid: false, reason: 'URL expired' };
  }

  // Generate expected signature
  let expectedSig;
  try {
    expectedSig = generateSignature(hash, expiresAt);
  } catch {
    return { valid: false, reason: 'Signature generation failed' };
  }

  // Constant-time comparison to prevent timing attacks
  // Both signatures should be base64url strings of equal length
  if (providedSig.length !== expectedSig.length) {
    return { valid: false, reason: 'Invalid signature format' };
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(providedSig, 'utf8'),
    Buffer.from(expectedSig, 'utf8')
  );

  if (!matches) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  return { valid: true };
}

/**
 * Express middleware to validate signed thumbnail URLs
 * 
 * Extracts signature and expiration from query parameters and validates them.
 * If valid, allows the request to proceed. If invalid, returns 403.
 * 
 * Should be used on the /display/thumbnails/:filename route.
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware function
 * 
 * @example
 * router.get('/thumbnails/:filename', validateSignedUrl, async (req, res) => {
 *   // Serve thumbnail...
 * });
 */
function validateSignedUrl(req, res, next) {
  const { filename } = req.params;
  const { sig, exp } = req.query;

  // Extract hash from filename (remove .jpg extension)
  const hash = filename ? filename.replace(/\.jpg$/i, '') : null;

  if (!hash) {
    return res.status(400).json({
      success: false,
      error: 'Invalid filename'
    });
  }

  // Verify signature
  const result = verifyThumbnailSignature(hash, sig, exp);

  if (!result.valid) {
    // Log for security monitoring (but don't expose reason to client)
    const reqId = req.id || req.headers['x-request-id'] || 'unknown';
    console.warn(`[urlSigning] Invalid signature: ${result.reason} (reqId: ${reqId})`);
    
    return res.status(403).json({
      success: false,
      error: 'Forbidden'
    });
  }

  // Signature valid - allow request to proceed
  next();
}

module.exports = {
  signThumbnailUrl,
  verifyThumbnailSignature,
  validateSignedUrl,
  DEFAULT_TTL_SECONDS
};
