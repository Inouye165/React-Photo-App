-- Harden chess move inserts and allow server-side sequencing
-- Harden chess move inserts and allow server-side sequencing

DROP TRIGGER IF EXISTS chess_moves_before_insert ON public.chess_moves;
DROP FUNCTION IF EXISTS public.handle_chess_move_insert();

CREATE OR REPLACE FUNCTION public.handle_chess_move_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  last_ply int;
  next_ply int;
  next_turn text;
BEGIN
  -- Lock the game row to ensure sequencing
  PERFORM 1 FROM public.games WHERE id = NEW.game_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF (SELECT status FROM public.games WHERE id = NEW.game_id) = 'aborted' THEN
    RAISE EXCEPTION 'Game is aborted';
  END IF;

  SELECT COALESCE(MAX(ply), 0) INTO last_ply FROM public.chess_moves WHERE game_id = NEW.game_id;
  next_ply := last_ply + 1;
  NEW.ply := next_ply;

  next_turn := CASE WHEN split_part(NEW.fen_after, ' ', 2) = 'w' THEN 'w' ELSE 'b' END;

  UPDATE public.games
  SET current_fen = NEW.fen_after,
      current_turn = next_turn,
      status = CASE WHEN status = 'waiting' THEN 'active' ELSE status END,
      updated_at = now()
  WHERE id = NEW.game_id;

  RETURN NEW;
END;
$func$;

CREATE TRIGGER chess_moves_before_insert
BEFORE INSERT ON public.chess_moves
FOR EACH ROW
EXECUTE FUNCTION public.handle_chess_move_insert();
