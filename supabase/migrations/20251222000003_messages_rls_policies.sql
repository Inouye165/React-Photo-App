-- RLS policies for chat messages.
--
-- Realtime (postgres_changes) filters rows using RLS, so authenticated clients
-- need a valid SELECT policy to receive realtime events.
--
-- Idempotent and safe in non-Supabase environments.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'messages'
  ) THEN
    -- Ensure RLS is on (required for Realtime row filtering).
    EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;';

    -- Defensive grants (RLS still applies).
    BEGIN
      EXECUTE 'GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;';
    EXCEPTION WHEN undefined_object THEN
      -- Roles may not exist outside Supabase.
      NULL;
    END;

    -- SELECT: allow room members to view messages in rooms they belong to.
    EXECUTE 'DROP POLICY IF EXISTS "Allow members to view messages" ON public.messages;';
    EXECUTE '
      CREATE POLICY "Allow members to view messages" ON public.messages
      FOR SELECT TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.room_members rm
          WHERE rm.room_id = messages.room_id
            AND rm.user_id = auth.uid()
        )
      );
    ';

    -- INSERT: allow room members to send messages for their own identity.
    EXECUTE 'DROP POLICY IF EXISTS "Allow members to send messages" ON public.messages;';
    EXECUTE '
      CREATE POLICY "Allow members to send messages" ON public.messages
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND sender_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.room_members rm
          WHERE rm.room_id = messages.room_id
            AND rm.user_id = auth.uid()
        )
      );
    ';
  END IF;
END $$;
