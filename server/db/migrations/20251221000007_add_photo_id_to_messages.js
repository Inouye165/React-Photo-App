// server/db/migrations/20251221000007_add_photo_id_to_messages.js

exports.up = async function up(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  // messages is a Supabase/RLS-managed table; use raw SQL for idempotent changes.
  const hasMessages = await knex.schema.hasTable('messages')
  if (!hasMessages) {
    await knex.schema.createTable('messages', (table) => {
      table.bigIncrements('id').primary()
      table.uuid('room_id').notNullable()
      table.uuid('sender_id').notNullable()
      table.text('content').notNullable()
      table.integer('photo_id').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      table.index(['room_id', 'created_at'], 'idx_messages_room_created_at')
      table.index(['sender_id'], 'idx_messages_sender_id')
    })

    const hasRooms = await knex.schema.hasTable('rooms')
    if (hasRooms) {
      await knex.schema.alterTable('messages', (table) => {
        table
          .foreign('room_id', 'messages_room_id_fkey')
          .references('id')
          .inTable('rooms')
          .onDelete('CASCADE')
      })
    }

    const hasUsers = await knex.schema.hasTable('users')
    if (hasUsers) {
      await knex.schema.alterTable('messages', (table) => {
        table
          .foreign('sender_id', 'messages_sender_id_fkey')
          .references('id')
          .inTable('users')
          .onDelete('RESTRICT')
      })
    }
  }

  await knex.raw('ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS photo_id integer NULL;')

  // Index to speed up authorization checks (room_id + photo_id lookups).
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i'
          AND c.relname = 'messages_room_photo_idx'
          AND n.nspname = 'public'
      ) THEN
        CREATE INDEX messages_room_photo_idx ON public.messages (room_id, photo_id) WHERE photo_id IS NOT NULL;
      END IF;
    END
    $$;
  `)

  // Best-effort FK (type must match photos.id). Keep as non-fatal to avoid breaking
  // environments where photos/messages may be managed differently.
  try {
    await knex.raw(`
      ALTER TABLE public.messages
      ADD CONSTRAINT messages_photo_id_fkey
      FOREIGN KEY (photo_id)
      REFERENCES public.photos(id)
      ON DELETE SET NULL;
    `)
  } catch {
    // ignore if already exists or cannot be created in current environment
  }
}

exports.down = async function down(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  try {
    await knex.raw('ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_photo_id_fkey;')
  } catch {
    // ignore
  }

  try {
    await knex.raw('DROP INDEX IF EXISTS public.messages_room_photo_idx;')
  } catch {
    // ignore
  }

  // Keep column by default to avoid destructive rollback in production.
}
