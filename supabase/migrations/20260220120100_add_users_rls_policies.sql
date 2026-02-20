-- Enable RLS on public.users (idempotent) and add policies
-- so that authenticated Supabase clients (PostgREST / Realtime) can:
--   * SELECT any user's id, username, avatar_url  (for chat user search & game invites)
--   * UPDATE their own row  (for profile edits via frontend)
--   * INSERT their own row  (for the handle_new_user trigger / onboarding)

-- 1. Enable RLS (no-op if already enabled)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. SELECT: authenticated users can read all user profiles
--    (needed by searchUsers in chat.ts & games.ts)
DROP POLICY IF EXISTS "users_select_authenticated" ON public.users;
CREATE POLICY "users_select_authenticated"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. INSERT: authenticated users can create their own profile row
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- 4. UPDATE: authenticated users can update their own profile row
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 5. Allow service_role full access (bypasses RLS by default, but be explicit)
DROP POLICY IF EXISTS "users_service_all" ON public.users;
CREATE POLICY "users_service_all"
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
