-- Allow room creators to read their own room rows immediately after insert.
-- This fixes INSERT ... RETURNING (PostgREST `?select=...`) failing under RLS
-- before room_members rows are added.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'rooms'
  ) THEN
    DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;

    CREATE POLICY "rooms_select_member" ON public.rooms
    FOR SELECT TO authenticated
    USING (
      auth.uid() IS NOT NULL
      AND (
        created_by = auth.uid()
        OR public.is_room_member(id)
      )
    );
  END IF;
END $$;
