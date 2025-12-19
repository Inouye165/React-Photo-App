const { validateEnv, PROD_REQUIRED } = require('../config/env.validate');
describe('Environment validation', () => {
  it('should pass when all required envs are present', () => {
    const backup = { ...process.env };
    process.env.NODE_ENV = 'production';
    PROD_REQUIRED.forEach((key) => { process.env[key] = 'test'; });
    expect(() => validateEnv({ nodeEnv: 'production' })).not.toThrow();
    process.env = backup;
  });
  it('should throw with missing envs', () => {
    const backup = { ...process.env };
    process.env.NODE_ENV = 'production';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    expect(() => validateEnv({ nodeEnv: 'production' })).toThrow(/Missing required environment variable/i);
    process.env = backup;
  });
});
