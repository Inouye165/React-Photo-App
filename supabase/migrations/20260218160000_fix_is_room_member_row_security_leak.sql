-- Fix: Remove row_security GUC leak from is_room_member function.
--
-- Root cause: is_room_member() called set_config('row_security', 'off', true)
-- which leaked row_security=off into the calling transaction. When Supabase
-- Realtime's apply_rls() evaluated messages RLS policies, the policy cascaded
-- into room_members RLS → is_room_member() → row_security='off' persisted.
-- The authenticated role (no BYPASSRLS) then hit:
--   42501 "query would be affected by row-level security policy for table messages"
--
-- Fix: The function is SECURITY DEFINER owned by postgres (superuser), which
-- already bypasses RLS automatically. The set_config was unnecessary and harmful.
-- Additionally, messages policies are simplified to use is_room_member() directly
-- instead of raw EXISTS subqueries to avoid cascading RLS evaluation.

DO $$
DECLARE
  has_room_members boolean;
  has_messages boolean;
  has_auth_uid boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'room_members'
  ) INTO has_room_members;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'messages'
  ) INTO has_messages;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) INTO has_auth_uid;

  -- 1. Fix is_room_member: remove the harmful set_config('row_security', 'off')
  IF has_room_members AND has_auth_uid THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $func$
      BEGIN
        -- SECURITY DEFINER runs as postgres (superuser) which already bypasses RLS.
        -- No need for set_config('row_security', 'off') — that leaked into the
        -- calling transaction and broke Supabase Realtime's apply_rls.
        RETURN EXISTS (
          SELECT 1
          FROM public.room_members rm
          WHERE rm.room_id = p_room_id
            AND rm.user_id = auth.uid()
        );
      END;
      $func$;
    $sql$;
  END IF;

  -- 2. Fix messages policies: use is_room_member() instead of raw EXISTS subqueries
  --    to avoid cascading RLS evaluation on room_members from within messages policies.
  IF has_messages AND has_auth_uid THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow members to view messages" ON public.messages;';
    EXECUTE '
      CREATE POLICY "Allow members to view messages" ON public.messages
      FOR SELECT
      USING (
        auth.uid() IS NOT NULL
        AND public.is_room_member(room_id)
      );
    ';

    EXECUTE 'DROP POLICY IF EXISTS "Allow members to send messages" ON public.messages;';
    EXECUTE '
      CREATE POLICY "Allow members to send messages" ON public.messages
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND sender_id = auth.uid()
        AND public.is_room_member(room_id)
      );
    ';
  END IF;

  -- 3. Ensure NO FORCE RLS (required for Supabase Realtime apply_rls compatibility)
  IF has_messages THEN
    ALTER TABLE public.messages NO FORCE ROW LEVEL SECURITY;
  END IF;
  IF has_room_members THEN
    ALTER TABLE public.room_members NO FORCE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rooms'
  ) THEN
    ALTER TABLE public.rooms NO FORCE ROW LEVEL SECURITY;
  END IF;
END $$;
