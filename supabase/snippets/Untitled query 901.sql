SELECT
  pc.relname AS table_name,
  pc.relrowsecurity AS rls_enabled,
  EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = pc.relname
  ) AS realtime_enabled
FROM 
  pg_class pc
JOIN 
  pg_namespace pn ON pn.oid = pc.relnamespace
WHERE 
  pn.nspname = 'public' 
  AND pc.relkind = 'r'
ORDER BY 
  table_name;