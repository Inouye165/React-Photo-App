/**
 * Create app_assessments table.
 *
 * Stores AI-driven application audit outputs for admin review.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  // Ensure UUID generation is available (Postgres only).
  if (isPg) {
    // Supabase commonly has pgcrypto enabled; still safe to ensure.
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  const hasTable = await knex.schema.hasTable('app_assessments');
  if (hasTable) return;

  await knex.schema.createTable('app_assessments', (table) => {
    if (isPg) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      table.uuid('id').primary();
    }

    // Enum-ish status.
    if (isPg) {
      table
        .enu('status', ['pending_review', 'confirmed', 'rejected'], {
          useNative: true,
          enumName: 'app_assessment_status',
        })
        .notNullable()
        .defaultTo('pending_review');
    } else {
      table.string('status', 32).notNullable().defaultTo('pending_review');
    }

    table.string('commit_hash');

    table.jsonb('raw_ai_response');
    table.jsonb('trace_log');

    table.float('final_grade');

    table.uuid('reviewer_id').nullable();
    table
      .foreign('reviewer_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    table.text('notes');

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index(['status']);
    table.index(['created_at']);
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  await knex.schema.dropTableIfExists('app_assessments');

  if (isPg) {
    // Drop enum type if present.
    await knex.raw('DO $$ BEGIN DROP TYPE IF EXISTS app_assessment_status; EXCEPTION WHEN others THEN NULL; END $$;');
  }
};
