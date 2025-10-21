// server/db/migrations/20251020000001_create_initial_tables.js
exports.up = function(knex) {
  return knex.schema
    .createTable('users', function (table) {
      table.increments('id').primary();
      table.string('username').notNullable().unique();
      table.string('email').notNullable().unique();
      table.string('password_hash').notNullable();
      table.string('role').notNullable().defaultTo('user');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('failed_login_attempts').notNullable().defaultTo(0);
      table.timestamp('last_login_attempt');
      table.timestamp('account_locked_until');
      table.timestamps(true, true); // Adds created_at and updated_at
    })
    .createTable('photos', function (table) {
      table.increments('id').primary();
      table.string('filename').unique();
      table.string('state');
      table.text('metadata');
      table.string('hash').unique();
      table.timestamps(true, true); // Adds created_at and updated_at
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('photos')
    .dropTableIfExists('users');
};