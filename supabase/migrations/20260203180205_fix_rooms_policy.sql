-- Drop the restrictive policy and replace it with a development-friendly one
DROP POLICY IF EXISTS "rooms_insert_authenticated" ON public.rooms;

CREATE POLICY "rooms_insert_authenticated" ON public.rooms
FOR INSERT 
TO authenticated
WITH CHECK (true);
