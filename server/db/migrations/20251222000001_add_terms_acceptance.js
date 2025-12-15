/**
 * Migration: Add terms_accepted_at column to users table
 * 
 * This column tracks when users accept the experimental/beta disclaimer.
 * NULL indicates the user has not accepted terms yet.
 * 
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  await knex.schema.table('users', (table) => {
    table.timestamp('terms_accepted_at').nullable();
  });

  // Add comment for documentation
  await knex.raw(`
    COMMENT ON COLUMN users.terms_accepted_at IS 'Timestamp when user accepted experimental/beta terms. NULL means not accepted.';
  `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  await knex.schema.table('users', (table) => {
    table.dropColumn('terms_accepted_at');
  });
};
