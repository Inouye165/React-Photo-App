exports.up = function(knex) {
  return knex.schema.table('photos', function(table) {
    table.string('state_transition_status').defaultTo('IDLE');
  });
};

exports.down = function(knex) {
  return knex.schema.table('photos', function(table) {
    table.dropColumn('state_transition_status');
  });
};
