/**
 * Add `display_path` column to `photos`.
 *
 * This migration exists to keep the repo's migration history aligned with
 * databases that have already applied it.
 */
exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('photos', 'display_path');
  if (hasColumn) return;

  await knex.schema.alterTable('photos', (table) => {
    table.text('display_path').nullable();
  });
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('photos', 'display_path');
  if (!hasColumn) return;

  await knex.schema.alterTable('photos', (table) => {
    table.dropColumn('display_path');
  });
};
