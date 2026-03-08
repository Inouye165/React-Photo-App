-- Add tutor-role profile support and whiteboard help request queue.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_tutor boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.whiteboard_help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claimed_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  request_text text NULL,
  problem_draft text NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  claimed_at timestamptz NULL,
  resolved_at timestamptz NULL,
  CONSTRAINT whiteboard_help_requests_status_check CHECK (status IN ('pending', 'claimed', 'resolved', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS whiteboard_help_requests_board_idx
  ON public.whiteboard_help_requests (board_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whiteboard_help_requests_status_idx
  ON public.whiteboard_help_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS whiteboard_help_requests_student_idx
  ON public.whiteboard_help_requests (student_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whiteboard_help_requests_claimed_by_idx
  ON public.whiteboard_help_requests (claimed_by_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS whiteboard_help_requests_one_active_per_board
  ON public.whiteboard_help_requests (board_id)
  WHERE status IN ('pending', 'claimed');

CREATE OR REPLACE FUNCTION public.touch_whiteboard_help_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS whiteboard_help_requests_set_updated_at ON public.whiteboard_help_requests;
CREATE TRIGGER whiteboard_help_requests_set_updated_at
  BEFORE UPDATE ON public.whiteboard_help_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_whiteboard_help_requests_updated_at();