// server/db/migrations/20251227000001_add_photos_display_path.js

exports.up = function (knex) {
  return knex.schema.alterTable('photos', function (table) {
    table.text('display_path').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('photos', function (table) {
    table.dropColumn('display_path');
  });
};
