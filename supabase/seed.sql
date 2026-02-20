-- Seed data for local Supabase development.
-- This runs after all migrations during `supabase db reset`.
-- It does NOT run during normal `supabase start` (data persists across restarts).

-- NOTE: Auth users are created via the Supabase Auth API (sign-up flow), not
-- directly via INSERT into auth.users.  The handle_new_user trigger will
-- automatically create public.users rows when auth users are inserted.
-- 
-- To create test accounts after a reset, sign up via the app UI or use:
--   curl -X POST http://127.0.0.1:54321/auth/v1/signup \
--     -H "apikey: <SUPABASE_ANON_KEY>" \
--     -H "Content-Type: application/json" \
--     -d '{"email":"test@example.com","password":"testpass123"}'
--
-- After sign-up, set a username via:
--   curl -X PATCH http://localhost:3001/api/users/me \
--     -H "Authorization: Bearer <ACCESS_TOKEN>" \
--     -H "Content-Type: application/json" \
--     -d '{"username":"testuser"}'

SELECT 1; -- no-op seed; extend as needed
