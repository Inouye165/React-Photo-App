-- Allow moves based on next turn derived from move history

DROP FUNCTION IF EXISTS public.expected_turn_for_game(uuid);

CREATE OR REPLACE FUNCTION public.expected_turn_for_game(p_game_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT CASE WHEN COALESCE(MAX(ply), 0) % 2 = 0 THEN 'w' ELSE 'b' END
  FROM public.chess_moves
  WHERE game_id = p_game_id;
$func$;

GRANT EXECUTE ON FUNCTION public.expected_turn_for_game(uuid) TO authenticated;

DROP POLICY IF EXISTS "Allow members to insert moves" ON public.chess_moves;
CREATE POLICY "Allow members to insert moves" ON public.chess_moves
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND created_by = auth.uid()
  AND public.is_game_member(chess_moves.game_id, auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.game_members gm
    JOIN public.games g ON g.id = gm.game_id
    WHERE gm.game_id = chess_moves.game_id
      AND gm.user_id = auth.uid()
      AND g.status <> 'aborted'
      AND (
        (gm.role = 'white' AND public.expected_turn_for_game(chess_moves.game_id) = 'w')
        OR (gm.role = 'black' AND public.expected_turn_for_game(chess_moves.game_id) = 'b')
      )
  )
);
