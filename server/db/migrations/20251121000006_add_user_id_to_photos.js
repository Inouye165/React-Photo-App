exports.up = function(knex) {
  return knex.schema.table('photos', function(table) {
    table.integer('user_id')
      .unsigned()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
  });
};

exports.down = function(knex) {
  return knex.schema.table('photos', function(table) {
    table.dropColumn('user_id');
  });
};
