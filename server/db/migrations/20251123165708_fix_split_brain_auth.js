/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Drop the local 'users' table to eliminate split-brain authentication
  // This table is redundant since we use Supabase Auth as the single source of truth
  // The photos.user_id column already has its FK constraint removed in migration 20251122_fix_user_id_uuid
  // and now stores Supabase UUID values directly
  
  await knex.schema.dropTableIfExists('users');
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Recreate the users table if rollback is needed
  // Note: This will not restore data, only the schema
  await knex.schema.createTable('users', function (table) {
    // Use appropriate UUID generation based on DB type
    if (knex.client.config.client === 'pg') {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      // SQLite fallback
      table.uuid('id').primary();
    }
    table.string('username').notNullable().unique();
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.string('role').notNullable().defaultTo('user');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('failed_login_attempts').notNullable().defaultTo(0);
    table.timestamp('last_login_attempt');
    table.timestamp('account_locked_until');
    table.timestamps(true, true); // Adds created_at and updated_at
  });
};
