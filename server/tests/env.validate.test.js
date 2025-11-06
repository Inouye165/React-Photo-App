const { validateEnv, REQUIRED } = require('../config/env.validate');
describe('Environment validation', () => {
  it('should pass when all required envs are present', () => {
    REQUIRED.forEach((key) => { process.env[key] = 'test'; });
    expect(() => validateEnv()).not.toThrow();
  });
  it('should throw with missing envs', () => {
    const backup = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    expect(() => validateEnv()).toThrow(/Missing required env: SUPABASE_URL, SUPABASE_ANON_KEY/);
    Object.assign(process.env, backup);
  });
});
