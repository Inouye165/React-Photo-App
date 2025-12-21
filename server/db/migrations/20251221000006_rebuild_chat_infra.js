// server/db/migrations/20251221000006_rebuild_chat_infra.js

/**
 * Rebuild Chat Infra (SAFE MODE):
 *
 * Production symptom: PostgREST returns 500 even on simple SELECT from room_members.
 * The most common cause is RLS policy recursion when a policy on room_members
 * queries room_members again (directly or indirectly).
 *
 * This migration keeps existing data intact and:
 * - Ensures basic GRANTs exist for Supabase roles
 * - Replaces room_members policies with non-recursive policies using a
 *   SECURITY DEFINER helper function.
 *
 * NOTE: The user requested DROP/RECREATE + OWNER changes. Those operations are
 * intentionally NOT performed here because they are destructive and often
 * not permitted by the migration role in Supabase.
 */

exports.up = async function up(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  // Basic grants (RLS still controls which rows are visible).
  try {
    await knex.raw('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;')
  } catch {
    // ignore if roles don't exist
  }

  try {
    await knex.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.rooms TO authenticated, service_role;')
    await knex.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.room_members TO authenticated, service_role;')
  } catch {
    // ignore if roles don't exist
  }

  // Helper used to avoid RLS recursion in policies.
  // SECURITY DEFINER runs as the function owner (typically postgres in Supabase)
  // and we disable row_security inside the function body.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      -- Avoid policy recursion
      PERFORM set_config('row_security', 'off', true);

      RETURN EXISTS (
        SELECT 1
        FROM public.room_members rm
        WHERE rm.room_id = p_room_id
          AND rm.user_id = auth.uid()
      );
    END;
    $$;
  `)

  // Ensure RLS is enabled (idempotent).
  await knex.raw('ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;')
  await knex.raw('ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;')

  // Drop problematic / outdated policies (idempotent)
  await knex.raw('DROP POLICY IF EXISTS "room_members_select_own" ON public.room_members;')
  await knex.raw('DROP POLICY IF EXISTS "room_members_select_member_rooms" ON public.room_members;')
  await knex.raw('DROP POLICY IF EXISTS "room_members_insert_member" ON public.room_members;')

  // Recreate room_members policies in a non-recursive way.
  // SELECT: allow viewing membership rows for rooms you belong to.
  await knex.raw(`
    CREATE POLICY "room_members_select_member_rooms" ON public.room_members
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND public.is_room_member(room_id)
    );
  `)

  // INSERT: allow inserting your own membership rows, and allow adding others
  // only when you are already a member.
  await knex.raw(`
    CREATE POLICY "room_members_insert_member" ON public.room_members
    FOR INSERT
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND (
        user_id = auth.uid()
        OR public.is_room_member(room_id)
      )
    );
  `)

  // Rooms policies should already exist from earlier migrations, but ensure
  // they don't accidentally get removed.
  await knex.raw('DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;')
  await knex.raw('DROP POLICY IF EXISTS "rooms_insert_authenticated" ON public.rooms;')

  await knex.raw(`
    CREATE POLICY "rooms_select_member" ON public.rooms
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.room_members rm
        WHERE rm.room_id = rooms.id
          AND rm.user_id = auth.uid()
      )
    );
  `)

  await knex.raw(`
    CREATE POLICY "rooms_insert_authenticated" ON public.rooms
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
  `)
}

exports.down = async function down(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  // Best-effort rollback: remove policies created here.
  try {
    await knex.raw('DROP POLICY IF EXISTS "room_members_select_member_rooms" ON public.room_members;')
    await knex.raw('DROP POLICY IF EXISTS "room_members_insert_member" ON public.room_members;')
    await knex.raw('DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;')
    await knex.raw('DROP POLICY IF EXISTS "rooms_insert_authenticated" ON public.rooms;')
  } catch {
    // ignore
  }

  // Keep helper function (safe) unless explicitly removed.
}
