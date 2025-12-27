/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('collectibles', (table) => {
    // Primary key for this table
    table.increments('id').primary();

    // The Foreign Key link to the photos table
    // We use .integer() to match your photos.id (which is 'integer')
    table.integer('photo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('photos')
      .onDelete('CASCADE'); // If a photo is deleted, delete its collectibles

    // A user-editable name for the item
    // e.g., "New Mutants #34" or "My grandmother's watch"
    table.string('name');

    // The JSONB column to store all the AI agent's findings
    // (valuation, condition, references, etc.)
    table.jsonb('ai_analysis');

    // Your user_notes field
    table.text('user_notes');

    // Standard timestamps
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('collectibles');
};