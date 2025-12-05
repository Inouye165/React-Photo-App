/**
 * URL Signing Stability Tests
 * 
 * Tests for the 24-hour time window approach to URL signing.
 * These tests verify that signatures remain stable within the same
 * time window for improved browser caching.
 * 
 * @module urlSigning.stability.test
 */

const { signThumbnailUrl } = require('../utils/urlSigning');

// Mock environment for consistent testing
process.env.THUMBNAIL_SIGNING_SECRET = 'test-signing-secret-for-unit-tests';

describe('URL Signing - Stability Tests (24-hour Time Windows)', () => {
  // Store original Date.now
  const originalDateNow = Date.now;

  afterEach(() => {
    // Restore Date.now after each test
    Date.now = originalDateNow;
  });

  describe('Time Window Stability', () => {
    test('should return identical signatures within same 24h window', () => {
      // Mock Date to 2025-01-01T10:00:00Z
      const time1 = new Date('2025-01-01T10:00:00Z').getTime();
      Date.now = jest.fn(() => time1);

      const hash = 'test-hash-stability';
      const sig1 = signThumbnailUrl(hash);

      // Advance Date to 2025-01-01T14:00:00Z (4 hours later, same day)
      const time2 = new Date('2025-01-01T14:00:00Z').getTime();
      Date.now = jest.fn(() => time2);

      const sig2 = signThumbnailUrl(hash);

      // Both signatures and expirations should be identical
      expect(sig1.sig).toBe(sig2.sig);
      expect(sig1.exp).toBe(sig2.exp);
    });

    test('should return identical signatures at start and end of same window', () => {
      // Mock Date to 2025-01-01T00:00:01Z (start of day)
      const timeStart = new Date('2025-01-01T00:00:01Z').getTime();
      Date.now = jest.fn(() => timeStart);

      const hash = 'test-hash-boundary';
      const sig1 = signThumbnailUrl(hash);

      // Advance Date to 2025-01-01T23:59:58Z (end of day)
      const timeEnd = new Date('2025-01-01T23:59:58Z').getTime();
      Date.now = jest.fn(() => timeEnd);

      const sig2 = signThumbnailUrl(hash);

      // Both signatures and expirations should be identical
      expect(sig1.sig).toBe(sig2.sig);
      expect(sig1.exp).toBe(sig2.exp);
    });
  });

  describe('Time Window Rollover', () => {
    test('should return different signatures across 24h boundary', () => {
      // Mock Date to 2025-01-01T23:59:59Z (1 second before midnight)
      const time1 = new Date('2025-01-01T23:59:59Z').getTime();
      Date.now = jest.fn(() => time1);

      const hash = 'test-hash-rollover';
      const sig1 = signThumbnailUrl(hash);

      // Advance Date to 2025-01-02T00:00:01Z (1 second after midnight)
      const time2 = new Date('2025-01-02T00:00:01Z').getTime();
      Date.now = jest.fn(() => time2);

      const sig2 = signThumbnailUrl(hash);

      // Signatures should be different after window rollover
      expect(sig1.sig).not.toBe(sig2.sig);
      expect(sig1.exp).not.toBe(sig2.exp);
    });

    test('should return different signatures on consecutive days', () => {
      // Mock Date to 2025-01-01T12:00:00Z
      const time1 = new Date('2025-01-01T12:00:00Z').getTime();
      Date.now = jest.fn(() => time1);

      const hash = 'test-hash-consecutive';
      const sig1 = signThumbnailUrl(hash);

      // Advance Date to 2025-01-02T12:00:00Z (next day same time)
      const time2 = new Date('2025-01-02T12:00:00Z').getTime();
      Date.now = jest.fn(() => time2);

      const sig2 = signThumbnailUrl(hash);

      // Signatures should be different on different days
      expect(sig1.sig).not.toBe(sig2.sig);
      expect(sig1.exp).not.toBe(sig2.exp);
    });
  });

  describe('Expiration Alignment', () => {
    test('should align expiration to end of current 24h window (UTC midnight)', () => {
      // Mock Date to 2025-01-01T10:00:00Z
      const testTime = new Date('2025-01-01T10:00:00Z').getTime();
      Date.now = jest.fn(() => testTime);

      const hash = 'test-hash-alignment';
      const result = signThumbnailUrl(hash);

      // Expected expiration: 2025-01-02T00:00:00Z (midnight UTC)
      const expectedExpSeconds = Math.floor(new Date('2025-01-02T00:00:00Z').getTime() / 1000);
      
      expect(result.exp).toBe(expectedExpSeconds);
    });

    test('should ensure expiration is always in the future', () => {
      // Mock Date to 2025-01-01T23:59:59Z (1 second before midnight)
      const testTime = new Date('2025-01-01T23:59:59Z').getTime();
      Date.now = jest.fn(() => testTime);

      const hash = 'test-hash-future';
      const result = signThumbnailUrl(hash);

      // Expiration should be in the future relative to the mocked time
      const nowSeconds = Math.floor(testTime / 1000);
      expect(result.exp).toBeGreaterThan(nowSeconds);
    });
  });
});
