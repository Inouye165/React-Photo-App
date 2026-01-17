/**
 * Create capture_intents table for cross-device capture handoff.
 *
 * SECURITY:
 * - user_id scoped rows
 * - intent states are limited to known values
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  if (isPg) {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  const hasTable = await knex.schema.hasTable('capture_intents');
  if (hasTable) return;

  await knex.schema.createTable('capture_intents', (table) => {
    if (isPg) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      table.uuid('id').primary();
    }

    table.uuid('user_id').notNullable();

    table.integer('photo_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('photos')
      .onDelete('CASCADE');

    table.integer('collectible_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('collectibles')
      .onDelete('SET NULL');

    if (isPg) {
      table
        .enu('state', ['open', 'consumed', 'expired', 'canceled'], {
          useNative: true,
          enumName: 'capture_intent_state',
        })
        .notNullable()
        .defaultTo('open');
    } else {
      table.string('state', 16).notNullable().defaultTo('open');
    }

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('consumed_at');
    table.timestamp('expires_at');

    table.index(['user_id', 'state', 'created_at']);
  });

  if (isPg) {
    await knex.raw(`
      ALTER TABLE "capture_intents"
      ADD CONSTRAINT "capture_intents_user_id_foreign"
      FOREIGN KEY ("user_id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;
    `);
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const client = knex.client?.config?.client;
  const isPg = client === 'pg' || client === 'postgresql';

  await knex.schema.dropTableIfExists('capture_intents');

  if (isPg) {
    await knex.raw('DO $$ BEGIN DROP TYPE IF EXISTS capture_intent_state; EXCEPTION WHEN others THEN NULL; END $$;');
  }
};
