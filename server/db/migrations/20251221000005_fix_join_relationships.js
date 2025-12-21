// server/db/migrations/20251221000005_fix_join_relationships.js

/**
 * Fix PostgREST join relationship for room_members -> rooms.
 *
 * Symptom: 500 on query like:
 *   /room_members?select=room_id,rooms!inner(id,name,is_group,created_at)&user_id=eq.<uid>
 *
 * Root causes in Supabase/PostgREST are typically:
 * - missing FK constraint (no relationship in schema cache)
 * - ambiguous/multiple relationships (needs explicit constraint name)
 * - missing GRANTs to anon/authenticated roles
 */

exports.up = async function up(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  // Ensure schema usage (defensive; required by PostgREST roles).
  try {
    await knex.raw('GRANT USAGE ON SCHEMA public TO anon, authenticated;')
  } catch {
    // ignore if roles don't exist
  }

  // Ensure explicit table grants (RLS still gates rows).
  try {
    await knex.raw('GRANT SELECT, INSERT ON TABLE public.rooms TO anon, authenticated;')
    await knex.raw('GRANT SELECT, INSERT ON TABLE public.room_members TO anon, authenticated;')
  } catch {
    // ignore if roles don't exist
  }

  // Ensure a deterministic FK constraint name for PostgREST embeddings.
  // We want: public.room_members(room_id) -> public.rooms(id)
  // named: room_members_room_id_fkey
  await knex.raw(`
    DO $$
    DECLARE
      target_exists boolean;
      other_fk text;
    BEGIN
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND c.conrelid = 'public.room_members'::regclass
          AND c.conname = 'room_members_room_id_fkey'
      ) INTO target_exists;

      IF target_exists THEN
        RETURN;
      END IF;

      SELECT c.conname INTO other_fk
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = 'public.room_members'::regclass
        AND c.confrelid = 'public.rooms'::regclass
        AND a.attname = 'room_id'
      LIMIT 1;

      IF other_fk IS NULL THEN
        EXECUTE 'ALTER TABLE public.room_members ADD CONSTRAINT room_members_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE';
      ELSE
        EXECUTE format('ALTER TABLE public.room_members RENAME CONSTRAINT %I TO room_members_room_id_fkey', other_fk);
      END IF;
    END $$;
  `)
}

exports.down = async function down(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  // We avoid dropping the FK on down() because it is semantically part of the schema.
  // Only revert grants best-effort.
  try {
    await knex.raw('REVOKE SELECT, INSERT ON TABLE public.rooms FROM anon, authenticated;')
    await knex.raw('REVOKE SELECT, INSERT ON TABLE public.room_members FROM anon, authenticated;')
  } catch {
    // ignore
  }
}
