-- Restart game: clear moves and reset board state

DROP FUNCTION IF EXISTS public.restart_game(uuid);

CREATE OR REPLACE FUNCTION public.restart_game(p_game_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_game_member(p_game_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to restart this game';
  END IF;

  DELETE FROM public.chess_moves WHERE game_id = p_game_id;

  UPDATE public.games
  SET status = 'waiting',
      current_fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      current_turn = 'w',
      result = NULL,
      updated_at = now()
  WHERE id = p_game_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.restart_game(uuid) TO authenticated;
