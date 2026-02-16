// server/db/migrations/20260216000001_create_user_activity_log.js

/**
 * Create user_activity_log table to track user actions:
 * sign_in, password_change, username_set, page_view (gallery/messages/games),
 * game_played, message_sent, sign_out, auto_logout_inactive.
 */

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('user_activity_log');
  if (hasTable) return;

  await knex.schema.createTable('user_activity_log', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().index();
    table.string('action', 50).notNullable().index();
    table.jsonb('metadata').defaultTo('{}');
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
  });

  // Composite index for querying a user's recent activity
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_user_activity_user_created ON user_activity_log (user_id, created_at DESC)'
  );
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('user_activity_log');
  if (!hasTable) return;
  await knex.schema.dropTable('user_activity_log');
};
