-- Wrap in a block to prevent failure if the rooms table hasn't been created yet
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rooms') THEN
        
        -- Drop the restrictive policy
        DROP POLICY IF EXISTS "rooms_insert_authenticated" ON public.rooms;

        -- Replace it with a development-friendly one
        CREATE POLICY "rooms_insert_authenticated" ON public.rooms
        FOR INSERT 
        TO authenticated
        WITH CHECK (true);
        
    END IF;
END $$;