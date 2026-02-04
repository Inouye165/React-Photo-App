-- Add last_read_at to room_members (guard for local stacks without chat tables)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'room_members'
      AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.room_members
    ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT now();

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      GRANT UPDATE (last_read_at) ON TABLE public.room_members TO authenticated;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'auth'
        AND p.proname = 'uid'
    ) AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      BEGIN
        EXECUTE 'CREATE POLICY "Allow members to update own last_read_at" ON public.room_members
        FOR UPDATE TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)';
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END IF;
  END IF;
END $$;
