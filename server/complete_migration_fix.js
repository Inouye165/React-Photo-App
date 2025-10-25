// Complete migration fix
const knex = require('knex');
const knexConfig = require('./knexfile');

const db = knex(knexConfig.development);

async function completeMigrationFix() {
  try {
    console.log('Completing migration fix...');
    
    // Check which columns exist in photos table
    const columns = await db.raw("PRAGMA table_info(photos)");
    const existingColumns = columns.map(col => col.name);
    console.log('Existing columns in photos table:', existingColumns);
    
    // List of columns that should exist after second migration
    const expectedColumns = [
      'caption', 'description', 'keywords', 'text_style', 
      'edited_filename', 'ai_retry_count', 'file_size', 'poi_analysis'
    ];
    
    // Add missing columns
    for (const column of expectedColumns) {
      if (!existingColumns.includes(column)) {
        console.log(`Adding missing column: ${column}`);
        switch (column) {
          case 'caption':
          case 'description':
          case 'keywords':
          case 'text_style':
          case 'poi_analysis':
            await db.schema.table('photos', table => table.text(column));
            break;
          case 'edited_filename':
            await db.schema.table('photos', table => table.string(column));
            break;
          case 'ai_retry_count':
            await db.schema.table('photos', table => table.integer(column).defaultTo(0));
            break;
          case 'file_size':
            await db.schema.table('photos', table => table.integer(column));
            break;
        }
      } else {
        console.log(`Column ${column} already exists`);
      }
    }
    
    // Mark the second migration as completed
    const migration2 = '20251020000002_add_photo_ai_fields.js';
    const existingMigration2 = await db('knex_migrations').where('name', migration2).first();
    
    if (!existingMigration2) {
      await db('knex_migrations').insert({
        name: migration2,
        batch: 2,
        migration_time: new Date()
      });
      console.log('Marked second migration as completed');
    }
    
    // Verify migration status
    const migrations = await db('knex_migrations').select('*').orderBy('batch');
    console.log('Current migrations:', migrations);
    
    console.log('Migration fix completed successfully!');
    
  } catch (error) {
    console.error('Error completing migration fix:', error);
  } finally {
    await db.destroy();
  }
}

completeMigrationFix();