// server/db/migrations/20260305000001_add_rooms_updated_at_and_whiteboard_segment_index.js
/**
 * Add missing `updated_at` column to `rooms` for chat-schema installs that were created
 * without timestamps. `whiteboard_events.segment_index` already has an earlier migration.
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
};
