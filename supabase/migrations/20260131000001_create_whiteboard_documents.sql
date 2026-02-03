-- Persist Yjs document snapshots for the collaborative whiteboard.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'whiteboard_documents'
  ) THEN
    EXECUTE '
      CREATE TABLE public.whiteboard_documents (
        board_id uuid PRIMARY KEY,
        ydoc bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    ';
  END IF;
END $$;
