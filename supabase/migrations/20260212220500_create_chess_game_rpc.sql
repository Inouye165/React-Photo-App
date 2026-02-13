-- Transactional game creation RPC used by frontend createChessGame()

DROP FUNCTION IF EXISTS public.create_chess_game(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.create_chess_game(
  p_created_by uuid,
  p_opponent_id uuid DEFAULT NULL,
  p_time_control jsonb DEFAULT NULL
)
RETURNS public.games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  caller_id uuid := auth.uid();
  created_game public.games;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_created_by IS DISTINCT FROM caller_id THEN
    RAISE EXCEPTION 'created_by must match authenticated user';
  END IF;

  IF p_opponent_id IS NOT NULL AND p_opponent_id = caller_id THEN
    RAISE EXCEPTION 'opponent cannot be the same as creator';
  END IF;

  INSERT INTO public.games (created_by, time_control)
  VALUES (caller_id, p_time_control)
  RETURNING * INTO created_game;

  INSERT INTO public.game_members (game_id, user_id, role)
  VALUES (created_game.id, caller_id, 'white');

  IF p_opponent_id IS NOT NULL THEN
    INSERT INTO public.game_members (game_id, user_id, role)
    VALUES (created_game.id, p_opponent_id, 'black');
  END IF;

  RETURN created_game;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.create_chess_game(uuid, uuid, jsonb) TO authenticated;
