/**
 * Placeholder migration: create_comments_table
 *
 * This file exists because some environments already have this migration name
 * recorded in `knex_migrations`, and the startup verifier requires the file to
 * exist on disk.
 *
 * The verifier checks only filenames; the DB will not re-run this migration if
 * it's already applied.
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
