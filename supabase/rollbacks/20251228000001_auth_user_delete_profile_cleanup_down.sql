-- Down migration (manual rollback) for auth user delete profile cleanup.

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
DROP FUNCTION IF EXISTS public.handle_user_delete();
