/**
 * Persist successful whiteboard tutor analysis results so repeated requests can reuse them.
 */

exports.up = async function up(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  if (isPg) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  const hasTutorCacheTable = await knex.schema.hasTable('whiteboard_tutor_cache');
  if (hasTutorCacheTable) {
    return;
  }

  await knex.schema.createTable('whiteboard_tutor_cache', (table) => {
    if (isPg) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      table.uuid('id').primary();
    }

    table.uuid('board_id').notNullable().references('id').inTable('rooms').onDelete('CASCADE');
    table.text('cache_key').notNullable();
    table.text('input_mode').notNullable();
    table.json('response_json').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['board_id', 'cache_key'], 'whiteboard_tutor_cache_board_cache_key_unique');
    table.index(['board_id', 'updated_at'], 'whiteboard_tutor_cache_board_updated_idx');
  });

  if (isPg) {
    await knex.raw(`
      ALTER TABLE public.whiteboard_tutor_cache
      ADD CONSTRAINT whiteboard_tutor_cache_input_mode_check
      CHECK (input_mode IN ('photo', 'text'))
    `);

    await knex.raw(`
      CREATE OR REPLACE FUNCTION public.touch_whiteboard_tutor_cache_updated_at()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at = timezone('utc', now());
        RETURN NEW;
      END;
      $$
    `);

    await knex.raw('DROP TRIGGER IF EXISTS whiteboard_tutor_cache_set_updated_at ON public.whiteboard_tutor_cache');
    await knex.raw(`
      CREATE TRIGGER whiteboard_tutor_cache_set_updated_at
      BEFORE UPDATE ON public.whiteboard_tutor_cache
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_whiteboard_tutor_cache_updated_at()
    `);
  }
};

exports.down = async function down(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  const hasTutorCacheTable = await knex.schema.hasTable('whiteboard_tutor_cache');
  if (!hasTutorCacheTable) {
    return;
  }

  if (isPg) {
    await knex.raw('DROP TRIGGER IF EXISTS whiteboard_tutor_cache_set_updated_at ON public.whiteboard_tutor_cache');
    await knex.raw('DROP FUNCTION IF EXISTS public.touch_whiteboard_tutor_cache_updated_at()');
  }

  await knex.schema.dropTable('whiteboard_tutor_cache');
};
