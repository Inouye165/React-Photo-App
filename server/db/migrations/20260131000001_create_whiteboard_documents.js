// server/db/migrations/20260131000001_create_whiteboard_documents.js

/**
 * Persist Yjs document snapshots for the collaborative whiteboard.
 */

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('whiteboard_documents');
  if (hasTable) return;

  await knex.schema.createTable('whiteboard_documents', (table) => {
    table.uuid('board_id').primary();
    table.binary('ydoc').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
  });
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('whiteboard_documents');
  if (!hasTable) return;
  await knex.schema.dropTable('whiteboard_documents');
};
