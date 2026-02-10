-- Fix chess_moves insert policy and ensure games.current_turn defaults
ALTER TABLE public.games
  ALTER COLUMN current_turn SET DEFAULT 'w';

UPDATE public.games
SET current_turn = 'w'
WHERE current_turn IS NULL;

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
      AND (
        g.current_turn IS NULL
        OR (gm.role = 'white' AND g.current_turn = 'w')
        OR (gm.role = 'black' AND g.current_turn = 'b')
      )
  )
);
