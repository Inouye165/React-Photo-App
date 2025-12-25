/**
 * Add indexes to support efficient pagination for photos listing
 * Supports both filtered (by state) and unfiltered queries with stable ordering
 */
exports.up = async function(knex) {
  // Check if we're using PostgreSQL or SQLite
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgres';
  
  if (isPostgres) {
    // PostgreSQL: Create composite index with DESC ordering
    // This index supports:
    // 1. Queries with state filter: WHERE user_id = ? AND state = ? ORDER BY created_at DESC, id DESC
    // 2. Queries without state: WHERE user_id = ? ORDER BY created_at DESC, id DESC
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_photos_pagination 
      ON photos (user_id, state, created_at DESC, id DESC)
    `);
  } else {
    // SQLite: Doesn't support DESC in index definition, but index still helps
    await knex.schema.table('photos', (table) => {
      table.index(['user_id', 'state', 'created_at', 'id'], 'idx_photos_pagination');
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.table('photos', (table) => {
    table.dropIndex(['user_id', 'state', 'created_at', 'id'], 'idx_photos_pagination');
  });
};
