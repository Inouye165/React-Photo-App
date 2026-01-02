/**
 * Placeholder migration: allow_null_photo_id_for_feedback
 *
 * This file exists because some environments already have this migration name
 * recorded in `knex_migrations`, and Knex requires the file to exist on disk.
 *
 * If the database has already applied this migration, it will NOT be re-run.
 */

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  void knex;
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  void knex;
};
