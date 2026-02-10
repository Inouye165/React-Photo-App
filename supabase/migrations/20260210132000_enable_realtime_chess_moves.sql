-- Enable Supabase Realtime replication for chess_moves
-- Ensures INSERT events on public.chess_moves are published via supabase_realtime.
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
        AND c.relname = 'chess_moves'
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
          AND c.relname = 'chess_moves'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chess_moves;
      END IF;
    END IF;
  END IF;
END $$;
