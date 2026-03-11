DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.room_members
    WHERE room_id IS NULL OR user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'room_members contains null room_id or user_id values; cannot add composite uniqueness';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.room_members
    GROUP BY room_id, user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'room_members contains duplicate (room_id, user_id) rows; cannot add composite uniqueness';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'room_members_room_id_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX room_members_room_id_user_id_unique
      ON public.room_members (room_id, user_id);
  END IF;
END
$$;
