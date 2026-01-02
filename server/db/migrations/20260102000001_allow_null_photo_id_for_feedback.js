/**
 * Migration: allow_null_photo_id_for_feedback
 *
 * Alters the comments table to allow NULL photo_id values.
 * This enables app-wide feedback submissions (not tied to a specific photo).
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  // Check if the table/column exists and if it's currently NOT NULL.
  const hasTable = await knex.schema.hasTable('comments');
  if (!hasTable) {
    console.log('[migration] comments table does not exist, skipping');
    return;
  }

  // PostgreSQL: ALTER COLUMN to drop NOT NULL constraint
  // SQLite: More complex - need to recreate table, but for SQLite we may skip
  const client = knex.client.config.client;

  if (client === 'pg' || client === 'postgresql') {
    const result = await knex.raw(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'comments' AND column_name = 'photo_id'"
    );

    const row = result && result.rows ? result.rows[0] : undefined;
    const isNullable = row && row.is_nullable ? String(row.is_nullable).toUpperCase() === 'YES' : false;

    if (isNullable) {
      console.log('[migration] comments.photo_id already allows NULL, skipping');
      return;
    }

    await knex.raw('ALTER TABLE comments ALTER COLUMN photo_id DROP NOT NULL');
    console.log('[migration] Altered comments.photo_id to allow NULL');
  } else {
    // For SQLite in tests, the column may already allow NULL or we skip
    console.log('[migration] Non-PostgreSQL database, skipping ALTER (may already allow NULL)');
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('comments');
  if (!hasTable) {
    return;
  }

  const client = knex.client.config.client;

  if (client === 'pg' || client === 'postgresql') {
    const result = await knex.raw(
      "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'comments' AND column_name = 'photo_id'"
    );

    const row = result && result.rows ? result.rows[0] : undefined;
    const isNullable = row && row.is_nullable ? String(row.is_nullable).toUpperCase() === 'YES' : false;

    if (!isNullable) {
      console.log('[migration] comments.photo_id already NOT NULL, skipping');
      return;
    }

    // First, delete any feedback rows (photo_id = NULL) so we can add NOT NULL back
    await knex('comments').whereNull('photo_id').del();
    await knex.raw('ALTER TABLE comments ALTER COLUMN photo_id SET NOT NULL');
    console.log('[migration] Reverted comments.photo_id to NOT NULL');
  }
};
