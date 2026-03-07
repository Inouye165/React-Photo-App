// server/db/migrations/20260305000001_add_rooms_updated_at_and_whiteboard_segment_index.js
/**
 * Add missing `updated_at` to `rooms` and `segment_index` to `whiteboard_events`.
 * The migration is idempotent and only adds columns that do not already exist.
 */
exports.up = async function up(knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    const hasUpdatedAt = await knex.schema.hasColumn('rooms', 'updated_at');
    if (!hasUpdatedAt) {
      await knex.schema.alterTable('rooms', (table) => {
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      });
    }
  }

  const hasEvents = await knex.schema.hasTable('whiteboard_events');
  if (hasEvents) {
    const hasSegmentIndex = await knex.schema.hasColumn('whiteboard_events', 'segment_index');
    if (!hasSegmentIndex) {
      await knex.schema.alterTable('whiteboard_events', (table) => {
        table.integer('segment_index').nullable();
      });
    }
  }
};

exports.down = async function down(knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (hasRooms) {
    const hasUpdatedAt = await knex.schema.hasColumn('rooms', 'updated_at');
    if (hasUpdatedAt) {
      await knex.schema.alterTable('rooms', (table) => {
        table.dropColumn('updated_at');
      });
    }
  }

  const hasEvents = await knex.schema.hasTable('whiteboard_events');
  if (hasEvents) {
    const hasSegmentIndex = await knex.schema.hasColumn('whiteboard_events', 'segment_index');
    if (hasSegmentIndex) {
      await knex.schema.alterTable('whiteboard_events', (table) => {
        table.dropColumn('segment_index');
      });
    }
  }
};
