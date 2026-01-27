-- Create whiteboard event persistence for replay.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'whiteboard_events'
  ) THEN
    EXECUTE '
      CREATE TABLE public.whiteboard_events (
        id bigserial PRIMARY KEY,
        board_id uuid NOT NULL,
        event_type text NOT NULL,
        stroke_id text NOT NULL,
        x double precision NOT NULL,
        y double precision NOT NULL,
        t bigint NOT NULL,
        source_id text,
        color text,
        width integer,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    ';

    EXECUTE 'CREATE INDEX whiteboard_events_board_id_idx ON public.whiteboard_events (board_id);';
    EXECUTE 'CREATE INDEX whiteboard_events_board_id_id_idx ON public.whiteboard_events (board_id, id);';
  END IF;
END $$;
