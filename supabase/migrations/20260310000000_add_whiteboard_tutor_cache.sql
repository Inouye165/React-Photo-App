-- Persist successful whiteboard tutor analysis responses for reuse.

CREATE TABLE IF NOT EXISTS public.whiteboard_tutor_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  input_mode text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT whiteboard_tutor_cache_input_mode_check CHECK (input_mode IN ('photo', 'text')),
  CONSTRAINT whiteboard_tutor_cache_board_cache_key_unique UNIQUE (board_id, cache_key)
);

CREATE INDEX IF NOT EXISTS whiteboard_tutor_cache_board_updated_idx
  ON public.whiteboard_tutor_cache (board_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.touch_whiteboard_tutor_cache_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whiteboard_tutor_cache_set_updated_at ON public.whiteboard_tutor_cache;
CREATE TRIGGER whiteboard_tutor_cache_set_updated_at
  BEFORE UPDATE ON public.whiteboard_tutor_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_whiteboard_tutor_cache_updated_at();
