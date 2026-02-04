// server/db/migrations/20251221000007_force_grants.js

/**
 * Force permission layer (debug):
 *
 * Symptom: PostgREST 403 on POST /rest/v1/rooms?select=...
 * Goal: ensure schema/table/sequence privileges exist and RLS policies allow
 * authenticated INSERT + SELECT (insert().select() requires SELECT).
 */

exports.up = async function up(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  // 1) Force schema usage grants
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT USAGE ON SCHEMA public TO anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT USAGE ON SCHEMA public TO authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT USAGE ON SCHEMA public TO service_role;
      END IF;
    END $$;
  `)

  // 2) Force broad table + sequence grants (debug)
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
      END IF;
    END $$;
  `)

  // 3) Ensure RLS is enabled (policies below are permissive)
  await knex.raw('ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;')
  await knex.raw('ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;')

  // 4) Policies required for insert().select() flows
  // Idempotency: drop if present then recreate.
  await knex.raw('DROP POLICY IF EXISTS "Allow authenticated insert" ON public.rooms;')
  await knex.raw('DROP POLICY IF EXISTS "Allow authenticated insert" ON public.room_members;')
  await knex.raw('DROP POLICY IF EXISTS "Debug select" ON public.rooms;')

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'CREATE POLICY "Allow authenticated insert" ON public.rooms FOR INSERT TO authenticated WITH CHECK (true)';
        EXECUTE 'CREATE POLICY "Allow authenticated insert" ON public.room_members FOR INSERT TO authenticated WITH CHECK (true)';
        EXECUTE 'CREATE POLICY "Debug select" ON public.rooms FOR SELECT TO authenticated USING (true)';
      END IF;
    END $$;
  `)
}

exports.down = async function down(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  // Best-effort rollback: remove policies created here.
  await knex.raw('DROP POLICY IF EXISTS "Allow authenticated insert" ON public.rooms;')
  await knex.raw('DROP POLICY IF EXISTS "Allow authenticated insert" ON public.room_members;')
  await knex.raw('DROP POLICY IF EXISTS "Debug select" ON public.rooms;')
}
