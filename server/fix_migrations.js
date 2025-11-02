// Fix database migration state
const knex = require('knex');
const knexConfig = require('./knexfile');
const logger = require('./logger');

const db = knex(knexConfig.development);

async function fixMigrationState() {
  try {
  logger.info('Fixing migration state...');
    
    // Check current state
    const photosExists = await db.schema.hasTable('photos');
    const usersExists = await db.schema.hasTable('users');
    
  logger.info('Photos table exists:', photosExists);
  logger.info('Users table exists:', usersExists);
    
    if (photosExists && !usersExists) {
  logger.info('Creating missing users table...');
      await db.schema.createTable('users', function (table) {
        table.increments('id').primary();
        table.string('username').notNullable().unique();
        table.string('email').notNullable().unique();
        table.string('password_hash').notNullable();
        table.string('role').notNullable().defaultTo('user');
        table.boolean('is_active').notNullable().defaultTo(true);
        table.integer('failed_login_attempts').notNullable().defaultTo(0);
        table.timestamp('last_login_attempt');
        table.timestamp('account_locked_until');
        table.timestamps(true, true);
      });
  logger.info('Users table created successfully');
    }
    
    // Mark the first migration as completed
    const migration1 = '20251020000001_create_initial_tables.js';
    const existingMigration1 = await db('knex_migrations').where('name', migration1).first();
    
    if (!existingMigration1) {
      await db('knex_migrations').insert({
        name: migration1,
        batch: 1,
        migration_time: new Date()
      });
  logger.info('Marked first migration as completed');
    }
    
    // Now run any remaining migrations
  logger.info('Running remaining migrations...');
    await db.migrate.latest();
  logger.info('All migrations completed successfully');
    
  } catch (error) {
    logger.error('Error fixing migration state:', error);
  } finally {
    await db.destroy();
  }
}

fixMigrationState();