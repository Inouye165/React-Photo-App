// Check database structure
const knex = require('knex');
const knexConfig = require('./knexfile');
const logger = require('./logger');

const db = knex(knexConfig.development);

async function checkDatabase() {
  try {
  logger.info('Checking database structure...');
    
    // Check if knex_migrations table exists
    const migrationTableExists = await db.schema.hasTable('knex_migrations');
  logger.info('knex_migrations table exists:', migrationTableExists);
    
    // Check if photos table exists
    const photosTableExists = await db.schema.hasTable('photos');
  logger.info('photos table exists:', photosTableExists);
    
    // Check if users table exists
    const usersTableExists = await db.schema.hasTable('users');
  logger.info('users table exists:', usersTableExists);
    
    if (migrationTableExists) {
      const migrations = await db('knex_migrations').select('*');
  logger.info('Applied migrations:', migrations);
    }
    
    if (photosTableExists) {
      const photosSchema = await db('pragma_table_info("photos")');
  logger.info('Photos table schema:', photosSchema);
    }
    
  } catch (error) {
    logger.error('Error checking database:', error);
  } finally {
    await db.destroy();
  }
}

checkDatabase();