exports.up = async function up(knex) {
  const client = knex.client.config.client
  const roomMembersTable = client === 'sqlite3' ? 'room_members' : 'public.room_members'

  const nullMembership = await knex('room_members')
    .whereNull('room_id')
    .orWhereNull('user_id')
    .first()

  if (nullMembership) {
    throw new Error('room_members contains null room_id or user_id values; cannot add composite uniqueness')
  }

  const duplicateMembership = await knex('room_members')
    .select('room_id', 'user_id')
    .groupBy('room_id', 'user_id')
    .havingRaw('COUNT(*) > 1')
    .first()

  if (duplicateMembership) {
    throw new Error('room_members contains duplicate (room_id, user_id) rows; cannot add composite uniqueness')
  }

  await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS room_members_room_id_user_id_unique ON ${roomMembersTable} (room_id, user_id);`)
};

exports.down = async function down(knex) {
  const client = knex.client.config.client
  const prefix = client === 'sqlite3' ? '' : 'public.'
  await knex.raw(`DROP INDEX IF EXISTS ${prefix}room_members_room_id_user_id_unique;`)
};
