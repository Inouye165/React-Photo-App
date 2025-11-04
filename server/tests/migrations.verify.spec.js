const fs = require('fs');
const path = require('path');
const knex = require('knex');
const knexfile = require('../knexfile');
const { verifyMigrations } = require('../scripts/check-migrations');

jest.useRealTimers();
jest.setTimeout(60_000);
process.env.NODE_ENV = 'test';

describe('migration verifier', () => {
  let kx;

  beforeAll(async () => {
    const cfg = knexfile.test;
    if (!cfg) {
      throw new Error('Missing knexfile.test config');
    }

    kx = knex({ ...cfg });

    const hasTable = await kx.schema.hasTable('knex_migrations');
    if (!hasTable) {
      await kx.schema.createTable('knex_migrations', table => {
        table.increments('id').primary();
        table.string('name');
        table.integer('batch').defaultTo(1);
        table.dateTime('migration_time').defaultTo(kx.fn.now());
      });
    }

    const migrationsDir = (cfg.migrations && cfg.migrations.directory)
      ? cfg.migrations.directory
      : path.join(__dirname, '..', 'db', 'migrations');

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));

    const existing = await kx('knex_migrations').select('name');
    const existingNames = new Set(existing.map(row => row.name));

    const toInsert = files
      .filter(name => !existingNames.has(name))
      .map(name => ({ name, batch: 1, migration_time: new Date().toISOString() }));

    if (toInsert.length > 0) {
      await kx('knex_migrations').insert(toInsert);
    }
  });

  afterAll(async () => {
    if (kx) {
      await kx.destroy();
    }
    await new Promise(resolve => setImmediate(resolve));
  });

  test('no DB-recorded migration is missing on disk', async () => {
    await expect(verifyMigrations()).resolves.toMatchObject({ missing: [] });
  });
});
