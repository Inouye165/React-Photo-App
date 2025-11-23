
exports.up = async function(knex) {
  // 1. Drop the foreign key constraint that references the local 'users' table
  await knex.schema.table('photos', function(table) {
    table.dropForeign('user_id');
  });

  // 2. Drop the column entirely to avoid type casting issues from Integer to UUID
  await knex.schema.table('photos', function(table) {
    table.dropColumn('user_id');
  });

  // 3. Add the column back as UUID
  await knex.schema.table('photos', function(table) {
    table.uuid('user_id'); 
  });
};

exports.down = async function(knex) {
  // 1. Drop the UUID column
  await knex.schema.table('photos', function(table) {
    table.dropColumn('user_id');
  });

  // 2. Add the column back as Integer
  await knex.schema.table('photos', function(table) {
    table.integer('user_id').unsigned();
  });

  // 3. Restore foreign key
  await knex.schema.table('photos', function(table) {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  });
};
