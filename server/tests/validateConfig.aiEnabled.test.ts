/* eslint-env jest */

const REQUIRED_BASE_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/postgres',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  JWT_SECRET: 'test-jwt-secret',
};

describe('validateConfig AI gating', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('development + AI disabled + missing key does not throw', () => {
    Object.assign(process.env, {
      ...REQUIRED_BASE_ENV,
      NODE_ENV: 'development',
    });
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_ENABLED;
    delete process.env.ENABLE_AI;

    const { validateConfig } = require('../bootstrap/validateConfig');
    expect(() => validateConfig()).not.toThrow();
  });

  test('development + AI enabled + missing key throws MISSING_AI_KEYS', () => {
    Object.assign(process.env, {
      ...REQUIRED_BASE_ENV,
      NODE_ENV: 'development',
      AI_ENABLED: 'true',
    });
    delete process.env.OPENAI_API_KEY;

    const { validateConfig } = require('../bootstrap/validateConfig');
    try {
      validateConfig();
      throw new Error('Expected validateConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('MISSING_AI_KEYS');
    }
  });

  test('production default + missing key throws MISSING_AI_KEYS', () => {
    Object.assign(process.env, {
      ...REQUIRED_BASE_ENV,
      NODE_ENV: 'production',
    });
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_ENABLED;
    delete process.env.ENABLE_AI;

    const { validateConfig } = require('../bootstrap/validateConfig');
    try {
      validateConfig();
      throw new Error('Expected validateConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('MISSING_AI_KEYS');
    }
  });
});
