/**
 * Persist one-time (or bounded-use) whiteboard invite links.
 */

exports.up = async function up(knex) {
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';
  const hasTable = await knex.schema.hasTable('whiteboard_invites');
  if (hasTable) return;

  await knex.schema.createTable('whiteboard_invites', (table) => {
    if (isPg) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      table.uuid('id').primary();
    }
    table.uuid('room_id').notNullable().references('id').inTable('rooms').onDelete('CASCADE');
    table.text('token_hash').notNullable().unique();
    table.uuid('created_by').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.integer('max_uses').notNullable().defaultTo(1);
    table.integer('uses').notNullable().defaultTo(0);
    table.timestamp('revoked_at', { useTz: true }).nullable();

    table.index(['room_id']);
    table.index(['created_by']);
  });
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('whiteboard_invites');
  if (!hasTable) return;
  await knex.schema.dropTable('whiteboard_invites');
};
