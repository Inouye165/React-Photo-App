// server/db/migrations/20251020000002_add_photo_ai_fields.js
exports.up = function(knex) {
  return knex.schema.table('photos', function (table) {
    table.text('caption');
    table.text('description');
    table.text('keywords');
    table.text('text_style');
    table.string('edited_filename');
    table.integer('ai_retry_count').defaultTo(0);
    table.integer('file_size');
    table.text('poi_analysis');
  });
};

exports.down = function(knex) {
  return knex.schema.table('photos', function (table) {
    table.dropColumn('caption');
    table.dropColumn('description');
    table.dropColumn('keywords');
    table.dropColumn('text_style');
    table.dropColumn('edited_filename');
    table.dropColumn('ai_retry_count');
    table.dropColumn('file_size');
    table.dropColumn('poi_analysis');
  });
};