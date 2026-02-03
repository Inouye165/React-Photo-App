-- Harden chat RLS: block non-members from rooms/messages and lock down membership writes.
--
-- This migration removes permissive policies and enforces membership-based access.
-- It also introduces rooms.created_by to support owner-scoped membership writes.

DO $$
DECLARE
  has_rooms boolean;
  has_room_members boolean;
  has_messages boolean;
  has_auth_uid boolean;
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

  IF has_rooms THEN
    -- Ensure created_by exists (owner id for membership control).
    EXECUTE 'ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS created_by uuid;';
  END IF;

  IF has_room_members THEN
    -- Backfill room owners using the earliest membership row.
    EXECUTE '
      UPDATE public.rooms r
      SET created_by = rm.user_id
      FROM (
        SELECT room_id, MIN(user_id::text)::uuid AS user_id
        FROM public.room_members
        GROUP BY room_id
      ) rm
      WHERE rm.room_id = r.id
        AND r.created_by IS NULL;
    ';
  END IF;

  -- Helper to avoid RLS recursion in policies.
  IF has_room_members AND has_auth_uid THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
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
        );
      END;
      $func$;
    $sql$;
  END IF;

  -- Ensure RLS is enabled + forced.
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

  -- Drop insecure policies (if present).
  IF has_rooms THEN
    EXECUTE 'DROP POLICY IF EXISTS "Debug select" ON public.rooms;';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated insert" ON public.rooms;';
  END IF;
  IF has_messages THEN
    EXECUTE 'DROP POLICY IF EXISTS "Permissive select messages" ON public.messages;';
    EXECUTE 'DROP POLICY IF EXISTS "Permissive insert messages" ON public.messages;';
    EXECUTE 'DROP POLICY IF EXISTS "Emergency send messages" ON public.messages;';
  END IF;
  IF has_room_members THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated insert" ON public.room_members;';
  END IF;

  -- Drop existing reviewed policies to re-create deterministically.
  IF has_rooms THEN
    EXECUTE 'DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;';
    EXECUTE 'DROP POLICY IF EXISTS "rooms_insert_authenticated" ON public.rooms;';
  END IF;
  IF has_room_members THEN
    EXECUTE 'DROP POLICY IF EXISTS "room_members_select_member_rooms" ON public.room_members;';
    EXECUTE 'DROP POLICY IF EXISTS "room_members_insert_member" ON public.room_members;';
  END IF;
  IF has_messages THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow members to view messages" ON public.messages;';
    EXECUTE 'DROP POLICY IF EXISTS "Allow members to send messages" ON public.messages;';
  END IF;

  IF has_auth_uid THEN
    -- Rooms: only members can view room metadata.
    IF has_rooms THEN
      EXECUTE '
        CREATE POLICY "rooms_select_member" ON public.rooms
        FOR SELECT TO authenticated
        USING (
          auth.uid() IS NOT NULL
          AND public.is_room_member(id)
        );
      ';

      -- Rooms: allow authenticated users to create rooms they own.
      EXECUTE '
        CREATE POLICY "rooms_insert_authenticated" ON public.rooms
        FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND created_by = auth.uid()
        );
      ';
    END IF;

    -- Room members: allow viewing membership rows for rooms you belong to.
    IF has_room_members THEN
      EXECUTE '
        CREATE POLICY "room_members_select_member_rooms" ON public.room_members
        FOR SELECT TO authenticated
        USING (
          auth.uid() IS NOT NULL
          AND public.is_room_member(room_id)
        );
      ';

      -- Room members: only room owner can add members (including themselves).
      EXECUTE '
        CREATE POLICY "room_members_insert_member" ON public.room_members
        FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.rooms r
            WHERE r.id = room_members.room_id
              AND r.created_by = auth.uid()
          )
        );
      ';
    END IF;

    -- Messages: only members can read/send messages in a room.
    IF has_messages THEN
      EXECUTE '
        CREATE POLICY "Allow members to view messages" ON public.messages
        FOR SELECT TO authenticated
        USING (
          auth.uid() IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.room_members rm
            WHERE rm.room_id = messages.room_id
              AND rm.user_id = auth.uid()
          )
        );
      ';

      EXECUTE '
        CREATE POLICY "Allow members to send messages" ON public.messages
        FOR INSERT TO authenticated
        WITH CHECK (
          auth.uid() IS NOT NULL
          AND sender_id = auth.uid()
          AND EXISTS (
            SELECT 1
            FROM public.room_members rm
            WHERE rm.room_id = messages.room_id
              AND rm.user_id = auth.uid()
          )
        );
      ';
    END IF;
  END IF;
END $$;
