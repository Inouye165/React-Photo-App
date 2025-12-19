describe('Centralized env config (production fail-fast)', () => {
  function withEnv(env, fn) {
    const backup = { ...process.env };
    process.env = { ...backup, ...env };
    try {
      return fn();
    } finally {
      process.env = backup;
    }
  }

  it('fails fast in production when JWT_SECRET is missing/empty', () => {
    withEnv({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      JWT_SECRET: ''
    }, () => {
      jest.resetModules();
      const { getConfig } = require('../config/env');
      expect(() => getConfig()).toThrow(/Missing required environment variable/i);
      expect(() => getConfig()).toThrow(/JWT_SECRET/);
    });
  });

  it('fails fast in production when Supabase config is missing', () => {
    withEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'prod-jwt-secret',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: ''
    }, () => {
      jest.resetModules();
      const { getConfig } = require('../config/env');
      expect(() => getConfig()).toThrow(/Missing required environment variable/i);
      expect(() => getConfig()).toThrow(/SUPABASE_URL|SUPABASE_ANON_KEY/);
    });
  });

  it('does not throw in non-production with minimal env', () => {
    withEnv({
      NODE_ENV: 'test',
      JWT_SECRET: '',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: ''
    }, () => {
      jest.resetModules();
      const { getConfig } = require('../config/env');
      expect(() => getConfig()).not.toThrow();
      const config = getConfig();
      expect(config.nodeEnv).toBe('test');
      expect(typeof config.jwtSecret).toBe('string');
      expect(config.jwtSecret.length).toBeGreaterThan(0);
    });
  });
});