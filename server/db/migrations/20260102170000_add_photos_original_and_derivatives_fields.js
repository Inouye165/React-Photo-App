/**
 * Add original/derivative tracking fields to `photos`.
 *
 * Backward compatible:
 * - Keeps existing columns (e.g. storage_path, display_path)
 * - Backfills original_* from existing rows where possible
 */

exports.up = async function up(knex) {
  async function addColumnIfMissing(columnName, addColumnFn) {
    const has = await knex.schema.hasColumn('photos', columnName);
    if (has) return;
    await knex.schema.alterTable('photos', (table) => {
      addColumnFn(table);
    });
  }

  await addColumnIfMissing('original_path', (table) => table.text('original_path').nullable());
  await addColumnIfMissing('original_mime', (table) => table.text('original_mime').nullable());
  await addColumnIfMissing('original_filename', (table) => table.text('original_filename').nullable());
  await addColumnIfMissing('original_size_bytes', (table) => table.bigint('original_size_bytes').nullable());

  await addColumnIfMissing('display_mime', (table) => table.text('display_mime').nullable());
  await addColumnIfMissing('thumb_path', (table) => table.text('thumb_path').nullable());
  await addColumnIfMissing('thumb_mime', (table) => table.text('thumb_mime').nullable());

  await addColumnIfMissing('derivatives_status', (table) => table.text('derivatives_status').nullable().defaultTo('pending'));
  await addColumnIfMissing('derivatives_error', (table) => table.text('derivatives_error').nullable());

  // Backfill for existing rows (best-effort, safe no-op if fields already populated)
  try {
    await knex('photos')
      .whereNull('original_path')
      .whereNotNull('storage_path')
      .update({ original_path: knex.raw('storage_path') });
  } catch {
    // ignore
  }

  try {
    await knex('photos')
      .whereNull('original_filename')
      .whereNotNull('filename')
      .update({ original_filename: knex.raw('filename') });
  } catch {
    // ignore
  }

  try {
    await knex('photos')
      .whereNull('original_size_bytes')
      .whereNotNull('file_size')
      .update({ original_size_bytes: knex.raw('file_size') });
  } catch {
    // ignore
  }

  try {
    await knex('photos')
      .whereNull('derivatives_status')
      .update({ derivatives_status: 'pending' });
  } catch {
    // ignore
  }
};

exports.down = async function down(knex) {
  // Drop columns only if present.
  async function dropColumnIfPresent(columnName) {
    const has = await knex.schema.hasColumn('photos', columnName);
    if (!has) return;
    await knex.schema.alterTable('photos', (table) => {
      table.dropColumn(columnName);
    });
  }

  await dropColumnIfPresent('derivatives_error');
  await dropColumnIfPresent('derivatives_status');
  await dropColumnIfPresent('thumb_mime');
  await dropColumnIfPresent('thumb_path');
  await dropColumnIfPresent('display_mime');
  await dropColumnIfPresent('original_size_bytes');
  await dropColumnIfPresent('original_filename');
  await dropColumnIfPresent('original_mime');
  await dropColumnIfPresent('original_path');
};
