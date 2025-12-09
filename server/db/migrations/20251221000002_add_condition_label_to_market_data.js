/**
 * Migration: Add condition_label to collectible_market_data
 * 
 * Adds an optional string column to store condition/grade information
 * (e.g., "CGC 9.8", "NM", "chipped") for individual market data points.
 * 
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function(knex) {
  await knex.schema.table('collectible_market_data', (table) => {
    table.string('condition_label', 100).nullable();
  });
};

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function(knex) {
  await knex.schema.table('collectible_market_data', (table) => {
    table.dropColumn('condition_label');
  });
};
