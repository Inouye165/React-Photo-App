/**
 * Add grid-optimized thumbnail path to `photos`.
 *
 * Backward compatible:
 * - Nullable column
 * - Existing rows remain valid and will fall back to large thumbs
 */

exports.up = async function up(knex) {
  const has = await knex.schema.hasColumn('photos', 'thumb_small_path');
  if (has) return;

  await knex.schema.alterTable('photos', (table) => {
    table.text('thumb_small_path').nullable();
  });
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('photos', 'thumb_small_path');
  if (!has) return;

  await knex.schema.alterTable('photos', (table) => {
    table.dropColumn('thumb_small_path');
  });
};
