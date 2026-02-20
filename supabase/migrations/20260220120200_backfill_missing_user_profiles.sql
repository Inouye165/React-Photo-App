-- Backfill: create public.users rows for any existing auth.users that are missing one.
-- This fixes the current state where users signed up but have no profile row
-- (e.g., after a Supabase volume reset or before the handle_new_user trigger existed).

INSERT INTO public.users (id, created_at, updated_at)
SELECT au.id, COALESCE(au.created_at, NOW()), NOW()
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
ON CONFLICT (id) DO NOTHING;
