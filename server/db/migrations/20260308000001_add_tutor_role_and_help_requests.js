/**
 * Add tutor role profile support and whiteboard help request queue tables.
 *
 * This mirrors the Supabase SQL migration so the runtime Knex migration path
 * used by local startup stays in sync with the schema expected by the server.
 */

exports.up = async function up(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  const hasUsersTable = await knex.schema.hasTable('users');
  if (hasUsersTable) {
    const hasIsTutor = await knex.schema.hasColumn('users', 'is_tutor');
    if (!hasIsTutor) {
      await knex.schema.alterTable('users', (table) => {
        table.boolean('is_tutor').notNullable().defaultTo(false);
      });
    }
  }

  if (isPg) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  const hasHelpRequestsTable = await knex.schema.hasTable('whiteboard_help_requests');
  if (!hasHelpRequestsTable) {
    await knex.schema.createTable('whiteboard_help_requests', (table) => {
      if (isPg) {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      } else {
        table.uuid('id').primary();
      }

      table.uuid('board_id').notNullable().references('id').inTable('rooms').onDelete('CASCADE');
      table.uuid('student_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('claimed_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.text('status').notNullable().defaultTo('pending');
      table.text('request_text').nullable();
      table.text('problem_draft').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('claimed_at', { useTz: true }).nullable();
      table.timestamp('resolved_at', { useTz: true }).nullable();

      table.index(['board_id', 'created_at'], 'whiteboard_help_requests_board_idx');
      table.index(['status', 'created_at'], 'whiteboard_help_requests_status_idx');
      table.index(['student_user_id', 'created_at'], 'whiteboard_help_requests_student_idx');
      table.index(['claimed_by_user_id', 'created_at'], 'whiteboard_help_requests_claimed_by_idx');
    });

    if (isPg) {
      await knex.raw(`
        ALTER TABLE public.whiteboard_help_requests
        ADD CONSTRAINT whiteboard_help_requests_status_check
        CHECK (status IN ('pending', 'claimed', 'resolved', 'cancelled'))
      `);

      await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS whiteboard_help_requests_one_active_per_board
        ON public.whiteboard_help_requests (board_id)
        WHERE status IN ('pending', 'claimed')
      `);

      await knex.raw(`
        CREATE OR REPLACE FUNCTION public.touch_whiteboard_help_requests_updated_at()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          NEW.updated_at = timezone('utc', now());
          RETURN NEW;
        END;
        $$
      `);

      await knex.raw('DROP TRIGGER IF EXISTS whiteboard_help_requests_set_updated_at ON public.whiteboard_help_requests');
      await knex.raw(`
        CREATE TRIGGER whiteboard_help_requests_set_updated_at
        BEFORE UPDATE ON public.whiteboard_help_requests
        FOR EACH ROW
        EXECUTE FUNCTION public.touch_whiteboard_help_requests_updated_at()
      `);
    }
  }
};

exports.down = async function down(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  const hasHelpRequestsTable = await knex.schema.hasTable('whiteboard_help_requests');
  if (hasHelpRequestsTable) {
    if (isPg) {
      await knex.raw('DROP TRIGGER IF EXISTS whiteboard_help_requests_set_updated_at ON public.whiteboard_help_requests');
      await knex.raw('DROP FUNCTION IF EXISTS public.touch_whiteboard_help_requests_updated_at()');
      await knex.raw('DROP INDEX IF EXISTS whiteboard_help_requests_one_active_per_board');
    }

    await knex.schema.dropTable('whiteboard_help_requests');
  }

  const hasUsersTable = await knex.schema.hasTable('users');
  if (hasUsersTable) {
    const hasIsTutor = await knex.schema.hasColumn('users', 'is_tutor');
    if (hasIsTutor) {
      await knex.schema.alterTable('users', (table) => {
        table.dropColumn('is_tutor');
      });
    }
  }
};
