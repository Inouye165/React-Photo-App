// server/db/migrations/20251221000003_create_chat_schema.js

/**
 * Migration: Create Chat Schema (rooms + room_members) and RLS policies.
 *
 * This schema is designed to work with Supabase PostgREST + RLS:
 * - rooms are only selectable by members
 * - authenticated users can create rooms
 * - authenticated users can add members to rooms they are in
 */

exports.up = async function up(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'

  if (isPg) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  const hasAuthSchema = isPg
    ? (await knex.raw(
        "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth' LIMIT 1;"
      )).rows.length > 0
    : false

  const hasAuthUid = isPg
    ? (await knex.raw(
        "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'auth' AND p.proname = 'uid' LIMIT 1;"
      )).rows.length > 0
    : false

  const hasRooms = await knex.schema.hasTable('rooms')
  if (!hasRooms) {
    await knex.schema.createTable('rooms', (table) => {
      if (isPg) {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
      } else {
        table.uuid('id').primary()
      }

      table.string('name').nullable()
      table.boolean('is_group').notNullable().defaultTo(false)

      if (isPg) {
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      } else {
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
      }
    })
  }

  const hasRoomMembers = await knex.schema.hasTable('room_members')
  if (!hasRoomMembers) {
    await knex.schema.createTable('room_members', (table) => {
      table.uuid('room_id').notNullable()
      table.uuid('user_id').notNullable()

      if (isPg) {
        table.timestamp('joined_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
      } else {
        table.timestamp('joined_at').notNullable().defaultTo(knex.fn.now())
      }

      table.primary(['room_id', 'user_id'])

      table
        .foreign('room_id')
        .references('id')
        .inTable('rooms')
        .onDelete('CASCADE')

      // NOTE: In Supabase, auth.users is the canonical identity table.
      // We add the FK via raw SQL (cross-schema) for PostgreSQL.
    })

    if (isPg && hasAuthSchema) {
      await knex.raw(`
        ALTER TABLE "room_members"
        ADD CONSTRAINT "room_members_user_id_foreign"
        FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;
      `)
    }
  }

  if (!hasRoomMembers) {
    await knex.schema.alterTable('room_members', (table) => {
      table.index(['user_id'], 'idx_room_members_user_id')
      table.index(['room_id'], 'idx_room_members_room_id')
    })
  }

  if (isPg && hasAuthUid) {
    // Enable RLS
    await knex.raw('ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;')
    await knex.raw('ALTER TABLE "room_members" ENABLE ROW LEVEL SECURITY;')

    // Table privileges for Supabase roles (defensive; avoids 403 from missing grants)
    await knex.raw(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          GRANT SELECT, INSERT ON "rooms" TO authenticated;
          GRANT SELECT, INSERT ON "room_members" TO authenticated;
        END IF;
      END $$;
    `)

    // Drop policies if they already exist (idempotent)
    await knex.raw('DROP POLICY IF EXISTS "rooms_select_member" ON "rooms";')
    await knex.raw('DROP POLICY IF EXISTS "rooms_insert_authenticated" ON "rooms";')
    await knex.raw('DROP POLICY IF EXISTS "room_members_select_own" ON "room_members";')
    await knex.raw('DROP POLICY IF EXISTS "room_members_insert_member" ON "room_members";')

    // Rooms: members can SELECT rooms where they have membership
    await knex.raw(`
      CREATE POLICY "rooms_select_member" ON "rooms"
      FOR SELECT
      USING (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM "room_members" rm
          WHERE rm.room_id = rooms.id
            AND rm.user_id = auth.uid()
        )
      );
    `)

    // Rooms: any authenticated user can create rooms
    await knex.raw(`
      CREATE POLICY "rooms_insert_authenticated" ON "rooms"
      FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
    `)

    // Room members: users can SELECT their own membership rows
    await knex.raw(`
      CREATE POLICY "room_members_select_own" ON "room_members"
      FOR SELECT
      USING (auth.uid() IS NOT NULL AND user_id = auth.uid());
    `)

    // Room members: authenticated user can add themselves, and can add others to rooms
    // where they are already a member.
    await knex.raw(`
      CREATE POLICY "room_members_insert_member" ON "room_members"
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
          user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM "room_members" rm
            WHERE rm.room_id = room_members.room_id
              AND rm.user_id = auth.uid()
          )
        )
      );
    `)
  }
}

exports.down = async function down(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'

  if (isPg) {
    try {
      await knex.raw('DROP POLICY IF EXISTS "rooms_select_member" ON "rooms";')
      await knex.raw('DROP POLICY IF EXISTS "rooms_insert_authenticated" ON "rooms";')
      await knex.raw('DROP POLICY IF EXISTS "room_members_select_own" ON "room_members";')
      await knex.raw('DROP POLICY IF EXISTS "room_members_insert_member" ON "room_members";')
    } catch {
      // ignore
    }

    try {
      await knex.raw('ALTER TABLE "rooms" DISABLE ROW LEVEL SECURITY;')
      await knex.raw('ALTER TABLE "room_members" DISABLE ROW LEVEL SECURITY;')
    } catch {
      // ignore
    }
  }

  // Drop in reverse order
  await knex.schema.dropTableIfExists('room_members')
  await knex.schema.dropTableIfExists('rooms')
}
