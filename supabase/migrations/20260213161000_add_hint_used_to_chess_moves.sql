-- Persist whether a move was played after viewing hints so both players can see hint usage.
ALTER TABLE public.chess_moves
  ADD COLUMN IF NOT EXISTS hint_used boolean NOT NULL DEFAULT false;

UPDATE public.chess_moves
SET hint_used = false
WHERE hint_used IS NULL;
