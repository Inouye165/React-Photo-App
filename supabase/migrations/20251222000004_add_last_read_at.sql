-- Add last_read_at to room_members
ALTER TABLE public.room_members
ADD COLUMN last_read_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Grant UPDATE on the specific column to authenticated users
GRANT UPDATE (last_read_at) ON TABLE public.room_members TO authenticated;

-- Create Policy for UPDATE
-- Users can only update their own membership row
CREATE POLICY "Allow members to update own last_read_at" ON public.room_members
FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
)
WITH CHECK (
  auth.uid() = user_id
);
