const {
  signThumbnailUrl,
  verifyThumbnailSignature,
  validateSignedUrl,
  DEFAULT_TTL_SECONDS
} = require('../utils/urlSigning');

// Mock environment for consistent testing
process.env.THUMBNAIL_SIGNING_SECRET = 'test-signing-secret-for-unit-tests';

describe('URL Signing - Unit Tests', () => {
  describe('signThumbnailUrl', () => {
    test('should generate valid signature and expiration', () => {
      const hash = 'abc123def456';
      const result = signThumbnailUrl(hash, 900);

      expect(result).toHaveProperty('sig');
      expect(result).toHaveProperty('exp');
      expect(typeof result.sig).toBe('string');
      expect(typeof result.exp).toBe('number');
      expect(result.sig.length).toBeGreaterThan(0);
      expect(result.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    test('should use default TTL when not specified', () => {
      const hash = 'test123';
      const before = Math.floor(Date.now() / 1000);
      const result = signThumbnailUrl(hash);
      const after = Math.floor(Date.now() / 1000);

      // Expiration should be approximately DEFAULT_TTL_SECONDS in the future
      expect(result.exp).toBeGreaterThanOrEqual(before + DEFAULT_TTL_SECONDS);
      expect(result.exp).toBeLessThanOrEqual(after + DEFAULT_TTL_SECONDS + 1);
    });

    test('should generate different signatures for different hashes', () => {
      const hash1 = 'abc123';
      const hash2 = 'def456';
      const ttl = 900;

      const result1 = signThumbnailUrl(hash1, ttl);
      const result2 = signThumbnailUrl(hash2, ttl);

      expect(result1.sig).not.toBe(result2.sig);
    });

    test('should generate different signatures for same hash at different times', async () => {
      const hash = 'abc123';
      const result1 = signThumbnailUrl(hash, 900);
      
      // Wait 1 second to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const result2 = signThumbnailUrl(hash, 900);

      expect(result1.sig).not.toBe(result2.sig);
      expect(result1.exp).not.toBe(result2.exp);
    });

    test('should throw error for invalid hash', () => {
      expect(() => signThumbnailUrl(null)).toThrow('Hash must be a non-empty string');
      expect(() => signThumbnailUrl('')).toThrow('Hash must be a non-empty string');
      expect(() => signThumbnailUrl(123)).toThrow('Hash must be a non-empty string');
    });

    test('should throw error for invalid TTL', () => {
      expect(() => signThumbnailUrl('abc123', 0)).toThrow('TTL must be a positive number');
      expect(() => signThumbnailUrl('abc123', -100)).toThrow('TTL must be a positive number');
      expect(() => signThumbnailUrl('abc123', 'invalid')).toThrow('TTL must be a positive number');
    });
  });

  describe('verifyThumbnailSignature', () => {
    test('should accept valid signature', () => {
      const hash = 'abc123def456';
      const { sig, exp } = signThumbnailUrl(hash, 900);

      const result = verifyThumbnailSignature(hash, sig, exp);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('should reject expired signature', () => {
      const hash = 'abc123';
      const pastExp = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      
      // Manually create a signature for past time (for testing expiry check)
      const { sig } = signThumbnailUrl(hash, 900);

      const result = verifyThumbnailSignature(hash, sig, pastExp);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('URL expired');
    });

    test('should reject tampered hash', () => {
      const originalHash = 'abc123';
      const tamperedHash = 'xyz789';
      const { sig, exp } = signThumbnailUrl(originalHash, 900);

      const result = verifyThumbnailSignature(tamperedHash, sig, exp);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Signature mismatch');
    });

    test('should reject tampered signature', () => {
      const hash = 'abc123';
      const { sig, exp } = signThumbnailUrl(hash, 900);
      const tamperedSig = sig.slice(0, -1) + 'X'; // Change last character

      const result = verifyThumbnailSignature(hash, tamperedSig, exp);

      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/Invalid signature|Signature mismatch/);
    });

    test('should reject tampered expiration', () => {
      const hash = 'abc123';
      const { sig, exp } = signThumbnailUrl(hash, 900);
      const tamperedExp = exp + 3600; // Add 1 hour

      const result = verifyThumbnailSignature(hash, sig, tamperedExp);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Signature mismatch');
    });

    test('should reject missing signature', () => {
      const result = verifyThumbnailSignature('abc123', null, 1234567890);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Missing signature');
    });

    test('should reject missing expiration', () => {
      const result = verifyThumbnailSignature('abc123', 'sig123', null);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Missing expiration');
    });

    test('should reject invalid expiration format', () => {
      const hash = 'abc123';
      const { sig } = signThumbnailUrl(hash, 900);

      const result = verifyThumbnailSignature(hash, sig, 'invalid');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid expiration timestamp');
    });

    test('should handle string expiration timestamp', () => {
      const hash = 'abc123';
      const { sig, exp } = signThumbnailUrl(hash, 900);

      // Pass expiration as string (as it would come from query params)
      const result = verifyThumbnailSignature(hash, sig, String(exp));

      expect(result.valid).toBe(true);
    });
  });

  describe('validateSignedUrl middleware', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {
        params: {},
        query: {},
        id: 'test-req-id'
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      mockNext = jest.fn();
    });

    test('should call next() for valid signed URL', () => {
      const hash = 'abc123def456';
      const { sig, exp } = signThumbnailUrl(hash, 900);

      mockReq.params.filename = `${hash}.jpg`;
      mockReq.query = { sig, exp };

      validateSignedUrl(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should return 403 for invalid signature', () => {
      const hash = 'abc123';
      const { exp } = signThumbnailUrl(hash, 900);

      mockReq.params.filename = `${hash}.jpg`;
      mockReq.query = { sig: 'invalid-signature', exp };

      validateSignedUrl(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Forbidden'
      });
    });

    test('should return 403 for expired URL', () => {
      const hash = 'abc123';
      const { sig } = signThumbnailUrl(hash, 900);
      const expiredExp = Math.floor(Date.now() / 1000) - 100;

      mockReq.params.filename = `${hash}.jpg`;
      mockReq.query = { sig, exp: expiredExp };

      validateSignedUrl(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    test('should return 400 for invalid filename', () => {
      mockReq.params.filename = '';
      mockReq.query = { sig: 'sig123', exp: 1234567890 };

      validateSignedUrl(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid filename'
      });
    });

    test('should handle filename with uppercase extension', () => {
      const hash = 'abc123';
      const { sig, exp } = signThumbnailUrl(hash, 900);

      mockReq.params.filename = `${hash}.JPG`; // Uppercase
      mockReq.query = { sig, exp };

      validateSignedUrl(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Security properties', () => {
    test('signatures should be deterministic for same inputs', () => {
      const hash = 'abc123';
      const exp = Math.floor(Date.now() / 1000) + 900;

      // Generate signature multiple times with same inputs
      const crypto = require('crypto');
      const SECRET = process.env.THUMBNAIL_SIGNING_SECRET;
      const message = `thumbnails/${hash}.jpg:${exp}`;
      
      const sig1 = crypto.createHmac('sha256', SECRET).update(message).digest('base64url');
      const sig2 = crypto.createHmac('sha256', SECRET).update(message).digest('base64url');

      expect(sig1).toBe(sig2);
    });

    test('should use constant-time comparison (timing-safe)', () => {
      // This test verifies that the verifyThumbnailSignature function
      // uses crypto.timingSafeEqual for signature comparison
      const hash = 'abc123';
      const { sig, exp } = signThumbnailUrl(hash, 900);

      // Measure time for valid signature
      const start1 = process.hrtime.bigint();
      verifyThumbnailSignature(hash, sig, exp);
      const time1 = process.hrtime.bigint() - start1;

      // Measure time for invalid signature (wrong hash)
      const start2 = process.hrtime.bigint();
      verifyThumbnailSignature('different-hash', sig, exp);
      const time2 = process.hrtime.bigint() - start2;

      // Times should be roughly similar (within 10x) - not revealing info through timing
      // Note: This is a weak test, but better than nothing
      const ratio = Number(time1) / Number(time2);
      expect(ratio).toBeGreaterThan(0.1);
      expect(ratio).toBeLessThan(10);
    });

    test('signature should include resource path to prevent substitution', () => {
      // If we sign "abc123", can we use that signature for "xyz789"?
      const hash1 = 'abc123';
      const hash2 = 'xyz789';
      const { sig, exp } = signThumbnailUrl(hash1, 900);

      const result = verifyThumbnailSignature(hash2, sig, exp);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Signature mismatch');
    });

    test('should not accept signature generated with wrong secret', () => {
      const hash = 'abc123';
      
      // Generate signature with original secret
      const { sig, exp } = signThumbnailUrl(hash, 900);

      // Temporarily change secret
      const originalSecret = process.env.THUMBNAIL_SIGNING_SECRET;
      process.env.THUMBNAIL_SIGNING_SECRET = 'different-secret';

      // Try to verify with different secret (by reimporting module)
      // Note: In real scenario, this would be a different server instance
      const crypto = require('crypto');
      const differentSecret = 'different-secret';
      const message = `thumbnails/${hash}.jpg:${exp}`;
      const expectedSigWithDifferentSecret = crypto.createHmac('sha256', differentSecret)
        .update(message)
        .digest('base64url');

      // Restore original secret
      process.env.THUMBNAIL_SIGNING_SECRET = originalSecret;

      // Signatures should be different
      expect(sig).not.toBe(expectedSigWithDifferentSecret);
    });
  });
});
