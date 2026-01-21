// server/db/migrations/20260122000001_add_chat_room_type.js

/**
 * Add room type + metadata for chat rooms.
 *
 * - type: 'general' | 'potluck'
 * - metadata: JSONB (potluck config, etc.)
 */

exports.up = async function up(knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (!hasRooms) return;

  const hasType = await knex.schema.hasColumn('rooms', 'type');
  if (!hasType) {
    await knex.schema.alterTable('rooms', (table) => {
      table.string('type').defaultTo('general').notNullable();
    });
  }

  const hasMetadata = await knex.schema.hasColumn('rooms', 'metadata');
  if (!hasMetadata) {
    await knex.schema.alterTable('rooms', (table) => {
      table.jsonb('metadata').defaultTo('{}').notNullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasRooms = await knex.schema.hasTable('rooms');
  if (!hasRooms) return;

  const hasType = await knex.schema.hasColumn('rooms', 'type');
  if (hasType) {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropColumn('type');
    });
  }

  const hasMetadata = await knex.schema.hasColumn('rooms', 'metadata');
  if (hasMetadata) {
    await knex.schema.alterTable('rooms', (table) => {
      table.dropColumn('metadata');
    });
  }
};
