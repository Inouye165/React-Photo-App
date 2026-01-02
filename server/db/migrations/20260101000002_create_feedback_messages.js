/**
 * Create feedback_messages table.
 *
 * Stores lightweight product feedback submitted from the SPA.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  // Ensure UUID generation is available (Postgres only).
  if (isPg) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  const hasTable = await knex.schema.hasTable('feedback_messages');
  if (hasTable) return;

  await knex.schema.createTable('feedback_messages', (table) => {
    if (isPg) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      table.uuid('id').primary();
    }

    table.text('message').notNullable();
    table.string('category', 80).nullable();
    table.text('url').nullable();

    if (isPg) {
      table.jsonb('context').nullable();
    } else {
      // SQLite fallback: store JSON as text
      table.text('context').nullable();
    }

    table.string('status', 50).defaultTo('new');
    table.string('ip_address', 45);
    table.text('user_agent').nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['status']);
    table.index(['created_at']);
    table.index(['category']);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('feedback_messages');
};
