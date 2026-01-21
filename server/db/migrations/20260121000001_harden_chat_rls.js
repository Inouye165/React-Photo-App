// server/db/migrations/20260121000001_harden_chat_rls.js

/**
 * Harden chat RLS: block non-members from rooms/messages and lock down membership writes.
 * Adds rooms.created_by to enforce owner-scoped membership changes.
 */

exports.up = async function up(knex) {
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';
  if (!isPg) return;

  const hasRooms = await knex.schema.hasTable('rooms');
  if (!hasRooms) return;

  const hasRoomMembers = await knex.schema.hasTable('room_members');
  const hasMessages = await knex.schema.hasTable('messages');

  const hasCreatedBy = await knex.schema.hasColumn('rooms', 'created_by');
  if (!hasCreatedBy) {
    await knex.schema.alterTable('rooms', (table) => {
      table.uuid('created_by').nullable();
    });
  }

  if (hasRoomMembers) {
    await knex.raw(`
      UPDATE public.rooms r
      SET created_by = rm.user_id
      FROM (
        SELECT room_id, MIN(user_id::text)::uuid AS user_id
        FROM public.room_members
        GROUP BY room_id
      ) rm
      WHERE rm.room_id = r.id
        AND r.created_by IS NULL;
    `);
  }

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

  await knex.raw('ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;');
  await knex.raw('ALTER TABLE public.rooms FORCE ROW LEVEL SECURITY;');
  if (hasRoomMembers) {
    await knex.raw('ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE public.room_members FORCE ROW LEVEL SECURITY;');
  }
  if (hasMessages) {
    await knex.raw('ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;');
    await knex.raw('ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;');
  }

  await knex.raw('DROP POLICY IF EXISTS "Debug select" ON public.rooms;');
  if (hasMessages) {
    await knex.raw('DROP POLICY IF EXISTS "Permissive select messages" ON public.messages;');
    await knex.raw('DROP POLICY IF EXISTS "Permissive insert messages" ON public.messages;');
    await knex.raw('DROP POLICY IF EXISTS "Emergency send messages" ON public.messages;');
  }
  if (hasRoomMembers) {
    await knex.raw('DROP POLICY IF EXISTS "Allow authenticated insert" ON public.room_members;');
  }
  await knex.raw('DROP POLICY IF EXISTS "Allow authenticated insert" ON public.rooms;');

  await knex.raw('DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;');
  await knex.raw('DROP POLICY IF EXISTS "rooms_insert_authenticated" ON public.rooms;');
  if (hasRoomMembers) {
    await knex.raw('DROP POLICY IF EXISTS "room_members_select_member_rooms" ON public.room_members;');
    await knex.raw('DROP POLICY IF EXISTS "room_members_insert_member" ON public.room_members;');
  }
  if (hasMessages) {
    await knex.raw('DROP POLICY IF EXISTS "Allow members to view messages" ON public.messages;');
    await knex.raw('DROP POLICY IF EXISTS "Allow members to send messages" ON public.messages;');
  }

  await knex.raw(`
    CREATE POLICY "rooms_select_member" ON public.rooms
    FOR SELECT
    USING (
      auth.uid() IS NOT NULL
      AND public.is_room_member(id)
    );
  `);

  await knex.raw(`
    CREATE POLICY "rooms_insert_authenticated" ON public.rooms
    FOR INSERT
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND created_by = auth.uid()
    );
  `);

  if (hasRoomMembers) {
    await knex.raw(`
      CREATE POLICY "room_members_select_member_rooms" ON public.room_members
      FOR SELECT
      USING (
        auth.uid() IS NOT NULL
        AND public.is_room_member(room_id)
      );
    `);

    await knex.raw(`
      CREATE POLICY "room_members_insert_member" ON public.room_members
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.rooms r
          WHERE r.id = room_members.room_id
            AND r.created_by = auth.uid()
        )
      );
    `);
  }

  if (hasMessages) {
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
  }
};

exports.down = async function down(knex) {
  const client = knex.client.config.client;
  const isPg = client === 'pg' || client === 'postgresql';
  if (!isPg) return;

  const hasRooms = await knex.schema.hasTable('rooms');
  if (!hasRooms) return;

  const hasRoomMembers = await knex.schema.hasTable('room_members');
  const hasMessages = await knex.schema.hasTable('messages');

  try {
    await knex.raw('DROP POLICY IF EXISTS "rooms_select_member" ON public.rooms;');
    await knex.raw('DROP POLICY IF EXISTS "rooms_insert_authenticated" ON public.rooms;');
    if (hasRoomMembers) {
      await knex.raw('DROP POLICY IF EXISTS "room_members_select_member_rooms" ON public.room_members;');
      await knex.raw('DROP POLICY IF EXISTS "room_members_insert_member" ON public.room_members;');
    }
    if (hasMessages) {
      await knex.raw('DROP POLICY IF EXISTS "Allow members to view messages" ON public.messages;');
      await knex.raw('DROP POLICY IF EXISTS "Allow members to send messages" ON public.messages;');
    }
  } catch {
    // ignore
  }
};
