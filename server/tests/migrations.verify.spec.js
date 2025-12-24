process.env.NODE_ENV = 'test';

// Deterministic unit tests: do not hit real DB/network.
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
}));

jest.mock('../knexfile', () => ({
  test: {
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    migrations: { directory: '/mock/migrations' },
  },
}));

jest.mock('knex', () => {
  const fakeDb = (tableName) => {
    if (tableName !== 'knex_migrations') {
      throw new Error(`Unexpected table: ${tableName}`);
    }
    return {
      select: async () => [{ name: '20251224000001_add_photos_pagination_indexes.js' }],
    };
  };
  fakeDb.schema = { hasTable: async () => true };
  fakeDb.destroy = async () => {};
  return jest.fn(() => fakeDb);
});

describe('migration verifier', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.SKIP_VERIFY_MIGRATIONS = 'false';
  });

  test('no DB-recorded migration is missing on disk', async () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['20251224000001_add_photos_pagination_indexes.js']);

    const { verifyMigrations } = require('../scripts/check-migrations');
    await expect(verifyMigrations()).resolves.toMatchObject({ missing: [] });
  });
});
