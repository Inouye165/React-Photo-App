-- Auto-create a public.users profile row when a new auth user signs up.
-- This ensures searchUsers() (chat & game invites) can find the user immediately
-- rather than waiting for the onboarding PATCH /api/users/me call.
-- The username defaults to NULL; users set it during onboarding.

-- Create or replace the trigger function.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, created_at, updated_at)
  VALUES (NEW.id, NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop any existing trigger to make this migration idempotent.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Fire after every new signup.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
