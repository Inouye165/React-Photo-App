exports.up = function(knex) {
  return knex.schema.alterTable('photos', table => {
    table.string('storage_path').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('photos', table => {
    table.dropColumn('storage_path');
  });
};