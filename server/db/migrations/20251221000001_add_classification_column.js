/**
 * Add classification column to photos table
 * This stores the AI classification type (scenery, food, collectibles, etc.)
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('photos', (table) => {
    table.string('classification', 50);
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('photos', (table) => {
    table.dropColumn('classification');
  });
};
