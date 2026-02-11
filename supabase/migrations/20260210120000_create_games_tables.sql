-- Create games, game_members, chess_moves and RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'games'
  ) THEN
    CREATE TABLE public.games (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type text NOT NULL DEFAULT 'chess',
      status text NOT NULL DEFAULT 'waiting',
      created_by uuid NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      time_control jsonb,
      current_fen text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      current_turn text,
      result jsonb,
      CONSTRAINT games_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_members'
  ) THEN
    CREATE TABLE public.game_members (
      game_id uuid NOT NULL,
      user_id uuid NOT NULL,
      role text NOT NULL,
      joined_at timestamptz DEFAULT now(),
      PRIMARY KEY (game_id, user_id),
      CONSTRAINT game_members_game_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE,
      CONSTRAINT game_members_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS game_members_unique_role ON public.game_members (game_id, role);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chess_moves'
  ) THEN
    CREATE TABLE public.chess_moves (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id uuid NOT NULL,
      ply int NOT NULL,
      uci text NOT NULL,
      fen_after text NOT NULL,
      created_by uuid NOT NULL,
      created_at timestamptz DEFAULT now(),
      CONSTRAINT chess_moves_game_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE,
      CONSTRAINT chess_moves_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS chess_moves_game_ply_unique ON public.chess_moves (game_id, ply);
  END IF;

  -- Enable RLS and grants
  EXECUTE 'ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;';
  BEGIN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.games TO authenticated;';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  EXECUTE 'DROP POLICY IF EXISTS "Allow members to view games" ON public.games;';
  EXECUTE '
    CREATE POLICY "Allow members to view games" ON public.games
    FOR SELECT TO authenticated
    USING (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.game_members gm WHERE gm.game_id = games.id AND gm.user_id = auth.uid()
      )
    );
  ';

  EXECUTE 'DROP POLICY IF EXISTS "Allow creator to insert games" ON public.games;';
  EXECUTE '
    CREATE POLICY "Allow creator to insert games" ON public.games
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
  ';

  EXECUTE 'DROP POLICY IF EXISTS "Allow members to update game" ON public.games;';
  EXECUTE '
    CREATE POLICY "Allow members to update game" ON public.games
    FOR UPDATE TO authenticated
    USING (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.game_members gm WHERE gm.game_id = games.id AND gm.user_id = auth.uid()
      )
    )
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.game_members gm WHERE gm.game_id = games.id AND gm.user_id = auth.uid()
      )
    );
  ';

  -- game_members RLS
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
          SELECT 1 FROM public.game_members gm2 WHERE gm2.game_id = game_members.game_id AND gm2.user_id = auth.uid()
        )
      )
    );
  ';

  EXECUTE 'DROP POLICY IF EXISTS "Allow insert invites by creator" ON public.game_members;';
  EXECUTE '
    CREATE POLICY "Allow insert invites by creator" ON public.game_members
    FOR INSERT TO authenticated
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND (
        -- allow creator to invite others when they are the creator of the game
        EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_members.game_id AND g.created_by = auth.uid())
        -- OR allow the invited user to insert themselves (join) if user_id = auth.uid()
        OR user_id = auth.uid()
      )
    );
  ';

  -- chess_moves RLS
  EXECUTE 'ALTER TABLE public.chess_moves ENABLE ROW LEVEL SECURITY;';
  BEGIN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.chess_moves TO authenticated;';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  EXECUTE 'DROP POLICY IF EXISTS "Allow members to view moves" ON public.chess_moves;';
  EXECUTE '
    CREATE POLICY "Allow members to view moves" ON public.chess_moves
    FOR SELECT TO authenticated
    USING (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.game_members gm WHERE gm.game_id = chess_moves.game_id AND gm.user_id = auth.uid()
      )
    );
  ';

  EXECUTE 'DROP POLICY IF EXISTS "Allow members to insert moves" ON public.chess_moves;';
  EXECUTE '
    CREATE POLICY "Allow members to insert moves" ON public.chess_moves
    FOR INSERT TO authenticated
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.game_members gm
        JOIN public.games g ON g.id = gm.game_id
        WHERE gm.game_id = chess_moves.game_id
          AND gm.user_id = auth.uid()
          AND (
            (gm.role = ''white'' AND g.current_turn = ''w'')
            OR (gm.role = ''black'' AND g.current_turn = ''b'')
          )
      )
    );
  ';

END $$;
