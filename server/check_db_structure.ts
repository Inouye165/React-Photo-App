import knexFactory, { type Knex } from 'knex';
import logger = require('./logger');

const knexConfig = require('./knexfile') as Record<string, Knex.Config>;
const db = knexFactory(knexConfig.development);

async function checkDatabase(): Promise<void> {
  try {
    logger.info('Checking database structure...');

    const migrationTableExists = await db.schema.hasTable('knex_migrations');
    logger.info('knex_migrations table exists:', migrationTableExists);

    const photosTableExists = await db.schema.hasTable('photos');
    logger.info('photos table exists:', photosTableExists);

    const usersTableExists = await db.schema.hasTable('users');
    logger.info('users table exists:', usersTableExists);

    if (migrationTableExists) {
      const migrations = await db('knex_migrations').select('*');
      logger.info('Applied migrations:', migrations);
    }

    if (photosTableExists) {
      const photosSchema = await db.raw('SELECT * FROM pragma_table_info(?)', ['photos']);
      logger.info('Photos table schema:', photosSchema);
    }
  } catch (error) {
    logger.error('Error checking database:', error);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

void checkDatabase();