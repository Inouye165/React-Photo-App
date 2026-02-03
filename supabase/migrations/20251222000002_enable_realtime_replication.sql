-- Enable Supabase Realtime replication for chat messages
--
-- This ensures INSERT events on public.messages are published via
-- the supabase_realtime publication, allowing clients to receive
-- realtime updates without manual refresh.
--
-- Idempotent: safe to run multiple times and safe in environments
-- that do not have the supabase_realtime publication.

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
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication p
        JOIN pg_publication_rel pr ON pr.prpubid = p.oid
        JOIN pg_class c ON c.oid = pr.prrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE p.pubname = 'supabase_realtime'
          AND n.nspname = 'public'
          AND c.relname = 'messages'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
      END IF;
    END IF;
  END IF;
END $$;
