-- Fix RLS recursion on game_members by avoiding self-referential policies
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.game_members ENABLE ROW LEVEL SECURITY;';
  BEGIN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.game_members TO authenticated;';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  EXECUTE 'DROP POLICY IF EXISTS "Allow select game_members to members" ON public.game_members;';
  EXECUTE '
    CREATE POLICY "Allow select game_members to members" ON public.game_members
    FOR SELECT TO authenticated
    USING (
      auth.uid() IS NOT NULL
      AND (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.games g
          WHERE g.id = game_members.game_id AND g.created_by = auth.uid()
        )
      )
    );
  ';
END $$;
