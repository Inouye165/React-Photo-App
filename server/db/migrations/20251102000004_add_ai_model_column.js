// server/db/migrations/20251102000004_add_ai_model_column.js

exports.up = function up(knex) {
  return knex.schema.table('photos', (table) => {
    table.string('ai_model');
  });
};

exports.down = function down(knex) {
  return knex.schema.table('photos', (table) => {
    table.dropColumn('ai_model');
  });
};
