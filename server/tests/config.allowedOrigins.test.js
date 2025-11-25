/**
 * Unit tests for server/config/allowedOrigins.js
 * Tests ALLOWED_ORIGINS environment variable parsing and whitespace handling
 */

describe('getAllowedOrigins', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a fresh copy of process.env for each test
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear the environment variables we're testing
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.CLIENT_ORIGIN;
    delete process.env.CLIENT_ORIGINS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should parse comma-separated ALLOWED_ORIGINS', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://staging.example.com';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    expect(origins).toContain('https://app.example.com');
    expect(origins).toContain('https://staging.example.com');
  });

  test('should handle whitespace in ALLOWED_ORIGINS', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com, https://staging.example.com , https://prod.example.com';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    expect(origins).toContain('https://app.example.com');
    expect(origins).toContain('https://staging.example.com');
    expect(origins).toContain('https://prod.example.com');
    
    // Verify no whitespace-only entries
    origins.forEach(origin => {
      expect(origin.trim()).toBe(origin);
      expect(origin).not.toBe('');
    });
  });

  test('should return strict defaults when ALLOWED_ORIGINS is unset', () => {
    // No environment variables set
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    // Should include default development origins for local workflow
    expect(origins).toContain('http://localhost:5173');
    expect(origins).toContain('http://localhost:3000');
    
    // Should NOT allow arbitrary IPs by default
    expect(origins).not.toContain('http://192.168.1.1:5173');
    expect(origins).not.toContain('http://10.0.0.1:5173');
  });

  test('should handle empty ALLOWED_ORIGINS string', () => {
    process.env.ALLOWED_ORIGINS = '';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    // Should still have defaults
    expect(origins.length).toBeGreaterThan(0);
    expect(origins).toContain('http://localhost:5173');
  });

  test('should handle single origin in ALLOWED_ORIGINS', () => {
    process.env.ALLOWED_ORIGINS = 'https://secure.example.com';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    expect(origins).toContain('https://secure.example.com');
  });

  test('should deduplicate origins', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://app.example.com';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    const count = origins.filter(o => o === 'https://app.example.com').length;
    expect(count).toBe(1);
  });

  test('should NOT merge ALLOWED_ORIGINS with defaults (secure by design)', () => {
    process.env.ALLOWED_ORIGINS = 'https://production.example.com';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    // When explicitly set, should ONLY have custom origins (not defaults)
    // This prevents accidental security holes in production
    expect(origins).toContain('https://production.example.com');
    expect(origins).not.toContain('http://localhost:5173');
    expect(origins.length).toBe(1);
  });

  test('should handle trailing commas gracefully', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://staging.example.com,';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    expect(origins).toContain('https://app.example.com');
    expect(origins).toContain('https://staging.example.com');
    // Should not have empty string
    expect(origins).not.toContain('');
  });

  test('should support CLIENT_ORIGIN for backward compatibility', () => {
    process.env.CLIENT_ORIGIN = 'https://legacy.example.com';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    expect(origins).toContain('https://legacy.example.com');
  });

  test('should support CLIENT_ORIGINS for backward compatibility', () => {
    process.env.CLIENT_ORIGINS = 'https://legacy1.example.com,https://legacy2.example.com';
    
    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();
    
    expect(origins).toContain('https://legacy1.example.com');
    expect(origins).toContain('https://legacy2.example.com');
  });
});
