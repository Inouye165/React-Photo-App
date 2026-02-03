-- Add room member ownership and enforce owner-only membership management.

DO $$
DECLARE
  has_rooms boolean;
  has_room_members boolean;
  has_messages boolean;
  has_auth_uid boolean;
  has_authenticated boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'rooms'
  ) INTO has_rooms;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'room_members'
  ) INTO has_room_members;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'messages'
  ) INTO has_messages;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth'
      AND p.proname = 'uid'
  ) INTO has_auth_uid;

  SELECT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'authenticated'
  ) INTO has_authenticated;

  IF has_room_members THEN
    EXECUTE 'ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;';
  END IF;

  IF has_rooms AND has_room_members THEN
    EXECUTE '
      UPDATE public.room_members rm
      SET is_owner = true
      FROM public.rooms r
      WHERE r.id = rm.room_id
        AND r.created_by = rm.user_id;
    ';
  END IF;

  IF has_room_members AND has_auth_uid THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.is_room_owner(p_room_id uuid)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $func$
      BEGIN
        PERFORM set_config('row_security', 'off', true);
        RETURN EXISTS (
          SELECT 1
          FROM public.room_members rm
          WHERE rm.room_id = p_room_id
            AND rm.user_id = auth.uid()
            AND rm.is_owner = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.rooms r
          WHERE r.id = p_room_id
            AND r.created_by = auth.uid()
        );
      END;
      $func$;
    $sql$;
  END IF;

  IF has_rooms THEN
    EXECUTE 'ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;';
    EXECUTE 'ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;';
  END IF;
  IF has_room_members THEN
    EXECUTE 'ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;';
    EXECUTE 'ALTER TABLE public.room_members FORCE ROW LEVEL SECURITY;';
  END IF;
  IF has_messages THEN
    EXECUTE 'ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;';
    EXECUTE 'ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;';
  END IF;

  IF has_authenticated AND has_room_members THEN
    EXECUTE 'GRANT UPDATE (is_owner) ON TABLE public.room_members TO authenticated;';
    EXECUTE 'GRANT DELETE ON TABLE public.room_members TO authenticated;';
  END IF;

  IF has_room_members THEN
    EXECUTE 'DROP POLICY IF EXISTS "room_members_insert_member" ON public.room_members;';
    EXECUTE 'DROP POLICY IF EXISTS "room_members_update_owner" ON public.room_members;';
    EXECUTE 'DROP POLICY IF EXISTS "room_members_delete_self" ON public.room_members;';
    EXECUTE 'DROP POLICY IF EXISTS "room_members_delete_owner" ON public.room_members;';
  END IF;

  IF has_auth_uid AND has_authenticated AND has_room_members THEN
    EXECUTE '
      CREATE POLICY "room_members_insert_member" ON public.room_members
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
          (
            public.is_room_owner(room_id)
            AND COALESCE(is_owner, false) = false
          )
          OR (
            user_id = auth.uid()
            AND COALESCE(is_owner, false) = true
            AND EXISTS (
              SELECT 1
              FROM public.rooms r
              WHERE r.id = room_members.room_id
                AND r.created_by = auth.uid()
            )
          )
        )
      );
    ';

    EXECUTE '
      CREATE POLICY "room_members_update_owner" ON public.room_members
      FOR UPDATE TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.rooms r
          WHERE r.id = room_members.room_id
            AND r.created_by = auth.uid()
        )
      )
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.rooms r
          WHERE r.id = room_members.room_id
            AND r.created_by = auth.uid()
        )
        AND (
          is_owner = true
          OR EXISTS (
            SELECT 1
            FROM public.room_members rm
            WHERE rm.room_id = room_members.room_id
              AND rm.is_owner = true
              AND rm.user_id <> room_members.user_id
          )
        )
      );
    ';

    EXECUTE '
      CREATE POLICY "room_members_delete_self" ON public.room_members
      FOR DELETE TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
        AND (
          NOT is_owner
          OR EXISTS (
            SELECT 1
            FROM public.room_members rm
            WHERE rm.room_id = room_members.room_id
              AND rm.is_owner = true
              AND rm.user_id <> room_members.user_id
          )
        )
      );
    ';

    EXECUTE '
      CREATE POLICY "room_members_delete_owner" ON public.room_members
      FOR DELETE TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND public.is_room_owner(room_id)
        AND user_id <> auth.uid()
        AND (
          NOT is_owner
          OR EXISTS (
            SELECT 1
            FROM public.room_members rm
            WHERE rm.room_id = room_members.room_id
              AND rm.is_owner = true
              AND rm.user_id <> room_members.user_id
          )
        )
      );
    ';
  END IF;
END $$;
