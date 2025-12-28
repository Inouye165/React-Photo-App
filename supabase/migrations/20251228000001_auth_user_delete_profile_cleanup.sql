-- Cleanup public.users row when a Supabase Auth user is deleted.
--
-- When a user is deleted from auth.users, remove the matching profile row
-- from public.users so usernames can be re-used.
--
-- Uses SECURITY DEFINER so the trigger can bypass RLS on public.users.

CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Use dynamic SQL to avoid hard dependency errors in non-Supabase / test DBs.
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users'
  ) THEN
    EXECUTE 'DELETE FROM public.users WHERE id = $1' USING OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_delete();
