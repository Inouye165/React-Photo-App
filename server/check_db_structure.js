// Check database structure
const knex = require('knex');
const knexConfig = require('./knexfile');

const db = knex(knexConfig.development);

async function checkDatabase() {
  try {
    console.log('Checking database structure...');
    
    // Check if knex_migrations table exists
    const migrationTableExists = await db.schema.hasTable('knex_migrations');
    console.log('knex_migrations table exists:', migrationTableExists);
    
    // Check if photos table exists
    const photosTableExists = await db.schema.hasTable('photos');
    console.log('photos table exists:', photosTableExists);
    
    // Check if users table exists
    const usersTableExists = await db.schema.hasTable('users');
    console.log('users table exists:', usersTableExists);
    
    if (migrationTableExists) {
      const migrations = await db('knex_migrations').select('*');
      console.log('Applied migrations:', migrations);
    }
    
    if (photosTableExists) {
      const photosSchema = await db('pragma_table_info("photos")');
      console.log('Photos table schema:', photosSchema);
    }
    
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await db.destroy();
  }
}

checkDatabase();