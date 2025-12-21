// server/db/migrations/20251221000004_fix_chat_room_members_select_policy.js

/**
 * Fix Chat RLS: room_members SELECT policy.
 *
 * The app needs to read other members in rooms the current user belongs to
 * (e.g. to hydrate DM titles and to compute DM intersections).
 *
 * Previous policy (room_members_select_own) was too restrictive and causes
 * 403s when selecting room_members rows for other users in the same room.
 */

exports.up = async function up(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  // Replace the overly-restrictive SELECT policy with a "member of room" policy.
  await knex.raw('DROP POLICY IF EXISTS "room_members_select_own" ON "room_members";')
  await knex.raw('DROP POLICY IF EXISTS "room_members_select_member_rooms" ON "room_members";')

  await knex.raw(`
    CREATE POLICY "room_members_select_member_rooms" ON "room_members"
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "room_members" rm
        WHERE rm.room_id = room_members.room_id
          AND rm.user_id = auth.uid()
      )
    );
  `)
}

exports.down = async function down(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  await knex.raw('DROP POLICY IF EXISTS "room_members_select_member_rooms" ON "room_members";')

  // Restore the previous (more restrictive) policy.
  await knex.raw(`
    CREATE POLICY "room_members_select_own" ON "room_members"
    FOR SELECT
    USING (auth.uid() IS NOT NULL AND user_id = auth.uid());
  `)
}
