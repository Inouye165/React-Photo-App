-- Realtime compatibility fix: keep RLS enabled, but disable FORCE RLS on chat tables.
--
-- Why: Supabase Realtime's realtime.apply_rls can fail with:
--   "query would be affected by row-level security policy"
-- when FORCE RLS is enabled on published tables. This blocks postgres_changes delivery
-- even though channel subscription reports SUBSCRIBED.
--
-- Security note: RLS remains ENABLED; only FORCE is removed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'messages'
  ) THEN
    ALTER TABLE public.messages NO FORCE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'room_members'
  ) THEN
    ALTER TABLE public.room_members NO FORCE ROW LEVEL SECURITY;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rooms'
  ) THEN
    ALTER TABLE public.rooms NO FORCE ROW LEVEL SECURITY;
  END IF;
END $$;
