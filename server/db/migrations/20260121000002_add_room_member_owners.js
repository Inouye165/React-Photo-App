// server/db/migrations/20260121000002_add_room_member_owners.js

/**
 * Add is_owner to room_members and backfill owner status from rooms.created_by.
 */

exports.up = async function up(knex) {
  const hasRoomMembers = await knex.schema.hasTable('room_members')
  if (!hasRoomMembers) return

  const hasIsOwner = await knex.schema.hasColumn('room_members', 'is_owner')
  if (!hasIsOwner) {
    await knex.schema.alterTable('room_members', (table) => {
      table.boolean('is_owner').notNullable().defaultTo(false)
    })
  }

  const hasRooms = await knex.schema.hasTable('rooms')
  const hasCreatedBy = hasRooms ? await knex.schema.hasColumn('rooms', 'created_by') : false
  if (hasRooms && hasCreatedBy) {
    const client = knex.client.config.client
    if (client === 'pg') {
      await knex.raw(`
        UPDATE public.room_members rm
        SET is_owner = true
        FROM public.rooms r
        WHERE r.id = rm.room_id
          AND r.created_by = rm.user_id;
      `)
    } else {
      await knex.raw(`
        UPDATE room_members
        SET is_owner = 1
        WHERE EXISTS (
          SELECT 1
          FROM rooms r
          WHERE r.id = room_members.room_id
            AND r.created_by = room_members.user_id
        );
      `)
    }
  }
}

exports.down = async function down(knex) {
  const hasRoomMembers = await knex.schema.hasTable('room_members')
  if (!hasRoomMembers) return

  const hasIsOwner = await knex.schema.hasColumn('room_members', 'is_owner')
  if (hasIsOwner) {
    await knex.schema.alterTable('room_members', (table) => {
      table.dropColumn('is_owner')
    })
  }
}
