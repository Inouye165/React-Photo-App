// server/db/migrations/20251228000001_messages_sender_id_on_delete_set_null.js

/**
 * Message retention for deleted users.
 *
 * Goal: allow deleting from public.users without losing conversation history.
 * We change the FK public.messages(sender_id) -> public.users(id) to:
 *   ON DELETE SET NULL
 *
 * This preserves messages for the other participant while allowing profile
 * cleanup / user deletion to proceed.
 */

exports.up = async function up(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'messages'
      ) THEN
        -- Ensure sender_id can be null once the user is deleted.
        BEGIN
          ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;
        EXCEPTION WHEN undefined_column THEN
          -- messages table exists but sender_id column does not; nothing to do.
          NULL;
        END;

        -- Replace the FK with ON DELETE SET NULL.
        -- Observed constraint name in production: messages_sender_id_fkey
        BEGIN
          ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
        EXCEPTION WHEN undefined_object THEN
          NULL;
        END;

        BEGIN
          ALTER TABLE public.messages
          ADD CONSTRAINT messages_sender_id_fkey
          FOREIGN KEY (sender_id)
          REFERENCES public.users(id)
          ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN
          -- Already exists (idempotent)
          NULL;
        END;
      END IF;
    END $$;
  `)
}

exports.down = async function down(knex) {
  const client = knex.client.config.client
  const isPg = client === 'pg' || client === 'postgresql'
  if (!isPg) return

  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'messages'
      ) THEN
        -- Drop the SET NULL FK and restore restrictive behaviour.
        BEGIN
          ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
        EXCEPTION WHEN undefined_object THEN
          NULL;
        END;

        BEGIN
          ALTER TABLE public.messages
          ADD CONSTRAINT messages_sender_id_fkey
          FOREIGN KEY (sender_id)
          REFERENCES public.users(id)
          ON DELETE RESTRICT;
        EXCEPTION WHEN duplicate_object THEN
          NULL;
        END;

        -- Only re-apply NOT NULL if it's safe.
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM public.messages WHERE sender_id IS NULL) THEN
            ALTER TABLE public.messages ALTER COLUMN sender_id SET NOT NULL;
          END IF;
        EXCEPTION WHEN undefined_column THEN
          NULL;
        END;
      END IF;
    END $$;
  `)
}
