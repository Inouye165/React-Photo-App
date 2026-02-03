/** * STEP 1: Add tables to the publication 
 * This turns on the "broadcast" for these specific tables.
 */
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;

/** * STEP 2: Set Replica Identity to FULL
 * CRITICAL FIX: By default, Postgres only sends the ID on updates/deletes. 
 * This forces it to send ALL data, preventing the "binding mismatch" 
 * when your frontend tries to filter by 'room_id' or other columns.
 */
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_members REPLICA IDENTITY FULL;