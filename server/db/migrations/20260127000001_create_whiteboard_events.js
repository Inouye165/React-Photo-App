// server/db/migrations/20260127000001_create_whiteboard_events.js

/**
 * Create whiteboard event persistence.
 * Stores raw stroke events for replay on join.
 */

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('whiteboard_events');
  if (hasTable) return;

  await knex.schema.createTable('whiteboard_events', (table) => {
    table.bigIncrements('id').primary();
    table.uuid('board_id').notNullable().index();
    table.string('event_type', 32).notNullable();
    table.string('stroke_id', 64).notNullable();
    table.float('x').notNullable();
    table.float('y').notNullable();
    table.bigInteger('t').notNullable();
    table.string('source_id', 64);
    table.string('color', 16);
    table.integer('width');
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index(['board_id', 'id'], 'whiteboard_events_board_id_id_idx');
  });
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('whiteboard_events');
  if (!hasTable) return;
  await knex.schema.dropTable('whiteboard_events');
};
