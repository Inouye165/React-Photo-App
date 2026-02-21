exports.up = async function up(knex) {
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';
  if (!isPg) return;

  await knex.raw('ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;');
  await knex.raw('ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;');
  await knex.raw('ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;');

  await knex.raw('ALTER TABLE public.rooms NO FORCE ROW LEVEL SECURITY;');
  await knex.raw('ALTER TABLE public.room_members NO FORCE ROW LEVEL SECURITY;');
  await knex.raw('ALTER TABLE public.messages NO FORCE ROW LEVEL SECURITY;');

  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      RETURN EXISTS (
        SELECT 1
        FROM public.room_members rm
        WHERE rm.room_id = p_room_id
          AND rm.user_id = auth.uid()
      );
    END;
    $$;
  `);

  await knex.raw('ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT now();');

  await knex.raw('DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;');
  await knex.raw(`
    CREATE POLICY "rooms_select_member" ON public.rooms
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND (
        created_by = auth.uid()
        OR public.is_room_member(id)
      )
    );
  `);

  await knex.raw('DROP POLICY IF EXISTS "Allow members to view messages" ON public.messages;');
  await knex.raw(`
    CREATE POLICY "Allow members to view messages" ON public.messages
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND public.is_room_member(room_id)
    );
  `);

  await knex.raw('DROP POLICY IF EXISTS "Allow members to send messages" ON public.messages;');
  await knex.raw(`
    CREATE POLICY "Allow members to send messages" ON public.messages
    FOR INSERT
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND sender_id = auth.uid()
      AND public.is_room_member(room_id)
    );
  `);
};

exports.down = async function down(knex) {
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';
  if (!isPg) return;

  await knex.raw('DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;');
  await knex.raw(`
    CREATE POLICY "rooms_select_member" ON public.rooms
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND public.is_room_member(id)
    );
  `);

  await knex.raw('DROP POLICY IF EXISTS "Allow members to view messages" ON public.messages;');
  await knex.raw('DROP POLICY IF EXISTS "Allow members to send messages" ON public.messages;');
  await knex.raw(`
    CREATE POLICY "Allow members to view messages" ON public.messages
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.room_members rm
        WHERE rm.room_id = messages.room_id
          AND rm.user_id = auth.uid()
      )
    );
  `);
  await knex.raw(`
    CREATE POLICY "Allow members to send messages" ON public.messages
    FOR INSERT
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND sender_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.room_members rm
        WHERE rm.room_id = messages.room_id
          AND rm.user_id = auth.uid()
      )
    );
  `);

  await knex.raw('ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;');
  await knex.raw('ALTER TABLE public.room_members FORCE ROW LEVEL SECURITY;');
  await knex.raw('ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;');

  await knex.raw(`
    CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      PERFORM set_config('row_security', 'off', true);
      RETURN EXISTS (
        SELECT 1
        FROM public.room_members rm
        WHERE rm.room_id = p_room_id
          AND rm.user_id = auth.uid()
      );
    END;
    $$;
  `);
};
