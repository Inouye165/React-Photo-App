import './env';
import knexFactory, { type Knex } from 'knex';

const knexConfig = require('./knexfile') as Record<string, Knex.Config>;
const knex = knexFactory(knexConfig.development);

async function inspectCollectibles(): Promise<void> {
  try {
    const exists = await knex.schema.hasTable('collectibles');
    if (!exists) {
      console.log('Collectibles table does not exist.');
      return;
    }

    const columnInfo = await knex('collectibles').columnInfo();
    console.log('Collectibles table columns:', columnInfo);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
}

void inspectCollectibles();