require('./env');
const knexConfig = require('./knexfile');
const knex = require('knex')(knexConfig.development);

async function inspectCollectibles() {
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
  } finally {
    await knex.destroy();
  }
}

inspectCollectibles();
