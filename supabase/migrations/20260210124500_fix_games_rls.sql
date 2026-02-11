-- Fix RLS recursion between games and game_members using a security definer helper
CREATE OR REPLACE FUNCTION public.is_game_member(p_game_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.game_members gm
    WHERE gm.game_id = p_game_id
      AND gm.user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_game_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Allow members to view games" ON public.games;
CREATE POLICY "Allow members to view games" ON public.games
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    created_by = auth.uid()
    OR public.is_game_member(games.id, auth.uid())
  )
);

DROP POLICY IF EXISTS "Allow members to update game" ON public.games;
CREATE POLICY "Allow members to update game" ON public.games
FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    created_by = auth.uid()
    OR public.is_game_member(games.id, auth.uid())
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    created_by = auth.uid()
    OR public.is_game_member(games.id, auth.uid())
  )
);
