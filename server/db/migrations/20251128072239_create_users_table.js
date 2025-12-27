/**
 * Migration: Create users table for user preferences
 * 
 * This table stores user-specific settings including grading scales
 * for the Smart Collector module. Uses Supabase auth.users UUID as primary key.
 * 
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  await knex.schema.createTable('users', (table) => {
    // Use UUID from Supabase auth.users
    table.uuid('id').primary();
    
    // JSONB column for preferences (grading scales, etc.)
    // Structure: { gradingScales: { "Category": [{ label, rank, definition }] } }
    table.jsonb('preferences').defaultTo('{}');
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Add comment for documentation (Postgres only)
  if (knex.client.config.client === 'pg') {
    await knex.raw(`
      COMMENT ON TABLE users IS 'Application users table storing preferences. id references Supabase auth.users.id';
    `);
    await knex.raw(`
      COMMENT ON COLUMN users.preferences IS 'JSONB blob for user settings including gradingScales for collectibles';
    `);
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('users');
};
