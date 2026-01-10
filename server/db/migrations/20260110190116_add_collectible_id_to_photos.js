/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
	return knex.schema.table('photos', (table) => {
		// NOTE: collectibles.id is an integer (increments) in this codebase,
		// so this must be integer to maintain FK compatibility.
		table
			.integer('collectible_id')
			.unsigned()
			.nullable()
			.references('id')
			.inTable('collectibles')
			.onDelete('SET NULL');

		table.index(['collectible_id'], 'idx_photos_collectible_id');
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
	return knex.schema.table('photos', (table) => {
		table.dropIndex(['collectible_id'], 'idx_photos_collectible_id');
		table.dropColumn('collectible_id');
	});
};
