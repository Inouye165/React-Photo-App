import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getConfig } from '../config/env';

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

type SignatureVerificationResult =
  | { valid: true }
  | { valid: false; reason: string };

type SignedThumbnailParams = {
  sig: string;
  exp: number;
};

// Centralized signing secret:
// - Production requires JWT_SECRET (and optionally THUMBNAIL_SIGNING_SECRET).
// - Non-prod gets a safe default JWT secret if not provided.
const SECRET = getConfig().thumbnailSigningSecret;

/**
 * Default TTL for signed URLs (15 minutes)
 * Short enough to limit exposure window, long enough for normal browsing
 * @deprecated TTL is now calculated based on time windows for cache stability
 */
export const DEFAULT_TTL_SECONDS = 15 * 60;

/**
 * Time window size in seconds (24 hours)
 * Signatures remain stable within each window for improved browser caching
 */
export const TIME_WINDOW_SECONDS = 24 * 60 * 60; // 86400 seconds

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
 */
function generateSignature(hash: string, expiresAt: number): string {
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
 * Uses 24-hour time windows aligned to UTC midnight for cache stability.
 * All signatures generated within the same time window will be identical,
 * enabling browser caching of signed URLs.
 * 
 * @param hash - Thumbnail hash (filename without extension)
 * @param ttlSeconds - Time-to-live in seconds (deprecated, ignored - uses time windows)
 */
export function signThumbnailUrl(
  hash: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): SignedThumbnailParams {
  if (!hash || typeof hash !== 'string') {
    throw new Error('Hash must be a non-empty string');
  }
  if (typeof ttlSeconds !== 'number' || ttlSeconds <= 0) {
    throw new Error('TTL must be a positive number');
  }

  // Calculate expiration timestamp using time windows for cache stability
  // Windows align to epoch (UTC midnight boundaries)
  const nowSeconds = Math.floor(Date.now() / 1000);
  
  // Find the end of the current time window
  // Formula: ceil(now / WINDOW) * WINDOW gives the next window boundary
  const expiresAt = Math.ceil((nowSeconds + 1) / TIME_WINDOW_SECONDS) * TIME_WINDOW_SECONDS;
  
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
 */
export function verifyThumbnailSignature(
  hash: string,
  providedSig: string | undefined,
  providedExp: number | string | undefined
): SignatureVerificationResult {
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
  if (Number.isNaN(expiresAt) || expiresAt <= 0) {
    return { valid: false, reason: 'Invalid expiration timestamp' };
  }

  // Check expiration (fail fast)
  const now = Math.floor(Date.now() / 1000);
  if (now >= expiresAt) {
    return { valid: false, reason: 'URL expired' };
  }

  // Generate expected signature
  let expectedSig: string;
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

function normalizeQueryValue(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string' || typeof first === 'number') {
      return first;
    }
  }
  return undefined;
}

function normalizeQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') {
      return first;
    }
  }
  return undefined;
}

function isSignatureInvalid(
  result: SignatureVerificationResult
): result is { valid: false; reason: string } {
  return result.valid === false;
}

/**
 * Express middleware to validate signed thumbnail URLs
 * 
 * Extracts signature and expiration from query parameters and validates them.
 * If valid, allows the request to proceed. If invalid, returns 403.
 * 
 * Should be used on the /display/thumbnails/:filename route.
 */
export function validateSignedUrl(req: Request, res: Response, next: NextFunction): void {
  const rawFilename = req.params.filename;
  const filename = Array.isArray(rawFilename) ? undefined : rawFilename;
  const { sig, exp } = req.query;

  if (typeof filename !== 'string' || filename.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Invalid filename'
    });
    return;
  }

  // Extract hash from filename (remove .jpg extension)
  const hash = filename.replace(/\.jpg$/i, '');

  if (!hash) {
    res.status(400).json({
      success: false,
      error: 'Invalid filename'
    });
    return;
  }

  const sigValue = normalizeQueryString(sig);
  const expValue = normalizeQueryValue(exp);

  // Verify signature
  const result = verifyThumbnailSignature(hash, sigValue, expValue);

  if (isSignatureInvalid(result)) {
    // Log for security monitoring (but don't expose reason to client)
    const reqId = (req as Request & { id?: string }).id || req.headers['x-request-id'] || 'unknown';
    console.warn(`[urlSigning] Invalid signature: ${result.reason} (reqId: ${reqId})`);
    
    res.status(403).json({
      success: false,
      error: 'Forbidden'
    });
    return;
  }

  // Signature valid - allow request to proceed
  next();
}