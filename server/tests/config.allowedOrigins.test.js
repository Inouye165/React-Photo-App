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
    delete process.env.FRONTEND_ORIGIN;
    delete process.env.CLIENT_ORIGIN;
    delete process.env.CLIENT_ORIGINS;
    delete process.env.CORS_ORIGIN;
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

  test('should support legacy CORS_ORIGIN (comma-separated)', () => {
    process.env.CORS_ORIGIN = 'https://justmypeeps.org,https://www.justmypeeps.org';

    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();

    expect(origins).toContain('https://justmypeeps.org');
    expect(origins).toContain('https://www.justmypeeps.org');
  });

  test('should normalize CORS_ORIGIN (trim + strip trailing slash)', () => {
    process.env.CORS_ORIGIN = ' https://justmypeeps.org/ , https://www.justmypeeps.org/ ';

    const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
    const origins = getOrigins();

    expect(origins).toContain('https://justmypeeps.org');
    expect(origins).toContain('https://www.justmypeeps.org');
    expect(origins).not.toContain('https://justmypeeps.org/');
    expect(origins).not.toContain('https://www.justmypeeps.org/');
  });

  describe('FRONTEND_ORIGIN support', () => {
    test('should include FRONTEND_ORIGIN with defaults when ALLOWED_ORIGINS not set', () => {
      process.env.FRONTEND_ORIGIN = 'https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app';
      
      const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
      const origins = getOrigins();
      
      // Should include the Vercel frontend
      expect(origins).toContain('https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app');
      // Should also include defaults for local dev
      expect(origins).toContain('http://localhost:5173');
      expect(origins).toContain('http://localhost:3000');
    });

    test('should include FRONTEND_ORIGIN even when ALLOWED_ORIGINS is set', () => {
      process.env.ALLOWED_ORIGINS = 'https://production.example.com';
      process.env.FRONTEND_ORIGIN = 'https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app';
      
      const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
      const origins = getOrigins();
      
      // Should include both the explicit origin and FRONTEND_ORIGIN
      expect(origins).toContain('https://production.example.com');
      expect(origins).toContain('https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app');
      // Should NOT include localhost defaults (ALLOWED_ORIGINS overrides them)
      expect(origins).not.toContain('http://localhost:5173');
    });

    test('should handle FRONTEND_ORIGIN with whitespace', () => {
      process.env.FRONTEND_ORIGIN = '  https://my-app.vercel.app  ';
      
      const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
      const origins = getOrigins();
      
      // Should be trimmed
      expect(origins).toContain('https://my-app.vercel.app');
      expect(origins).not.toContain('  https://my-app.vercel.app  ');
    });

    test('should include both apex + www for FRONTEND_ORIGIN apex domain', () => {
      process.env.FRONTEND_ORIGIN = 'https://justmypeeps.org';

      const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
      const origins = getOrigins();

      expect(origins).toContain('https://justmypeeps.org');
      expect(origins).toContain('https://www.justmypeeps.org');
    });

    test('should include both www + apex when FRONTEND_ORIGIN is www host', () => {
      process.env.FRONTEND_ORIGIN = 'https://www.justmypeeps.org';

      const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
      const origins = getOrigins();

      expect(origins).toContain('https://www.justmypeeps.org');
      expect(origins).toContain('https://justmypeeps.org');
    });

    test('should not auto-add www variants for non-apex hosts', () => {
      process.env.FRONTEND_ORIGIN = 'https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app';

      const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
      const origins = getOrigins();

      expect(origins).toContain('https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app');
      expect(origins).not.toContain('https://www.react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app');
    });

    test('should deduplicate FRONTEND_ORIGIN if already in ALLOWED_ORIGINS', () => {
      const vercelOrigin = 'https://react-photo-il8l0cuz2-ron-inouyes-projects.vercel.app';
      process.env.ALLOWED_ORIGINS = vercelOrigin;
      process.env.FRONTEND_ORIGIN = vercelOrigin;
      
      const { getAllowedOrigins: getOrigins } = require('../config/allowedOrigins');
      const origins = getOrigins();
      
      // Should only appear once
      const count = origins.filter(o => o === vercelOrigin).length;
      expect(count).toBe(1);
    });
  });
});
