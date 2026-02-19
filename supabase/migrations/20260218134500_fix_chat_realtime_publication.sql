-- Ensure chat tables are published to Supabase Realtime.
--
-- Root cause: local stacks created from older snapshots can end up with
-- supabase_realtime publication containing only unrelated tables (e.g. chess_moves),
-- so new chat messages are visible only after refresh (HTTP fetch) and not via realtime.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'messages'
        AND c.relkind = 'r'
    ) THEN
      BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'rooms'
        AND c.relkind = 'r'
    ) THEN
      BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'room_members'
        AND c.relkind = 'r'
    ) THEN
      BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END;
    END IF;
  END IF;
END $$;
