const { verifyMigrations } = require('../scripts/check-migrations');

describe('migration verifier', () => {
  const runTest = process.env.RUN_MIGRATION_VERIFY_TEST === 'true' || process.env.CI === 'true';

  if (!runTest) {
    test.skip('migration verifier (skipped — set RUN_MIGRATION_VERIFY_TEST=true to enable)', () => {});
    return;
  }

  // Migration verification may contact a remote DB; increase timeout to avoid flakes.
  jest.setTimeout(20000);

  test('no DB-recorded migration is missing on disk', async () => {
    await expect(verifyMigrations()).resolves.toMatchObject({ missing: [] });
  });
});
