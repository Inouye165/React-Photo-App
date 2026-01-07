/**
 * Add performance indexes for photos listing and deduplication.
 *
 * Root cause for large-account 500s:
 * - GET /photos does ORDER BY created_at DESC, id DESC and filters by user_id (and sometimes state)
 * - Without the right composite indexes, Postgres can time out on large datasets.
 */

exports.up = async function up(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgres'

  if (isPostgres) {
    // Primary listing index (no state filter)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_photos_user_created_id
      ON photos (user_id, created_at DESC, id DESC)
    `)

    // State-filtered listing index
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_photos_user_state_created
      ON photos (user_id, state, created_at DESC, id DESC)
    `)

    // Hash lookup index (upload dedup)
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_photos_hash
      ON photos (hash)
      WHERE hash IS NOT NULL
    `)

    return
  }

  // SQLite: doesn’t support DESC in index definition, but composite indexes still help.
  await knex.schema.table('photos', (table) => {
    table.index(['user_id', 'created_at', 'id'], 'idx_photos_user_created_id')
    table.index(['user_id', 'state', 'created_at', 'id'], 'idx_photos_user_state_created')
    table.index(['hash'], 'idx_photos_hash')
  })
}

exports.down = async function down(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgres'

  if (isPostgres) {
    await knex.raw('DROP INDEX IF EXISTS idx_photos_user_created_id')
    await knex.raw('DROP INDEX IF EXISTS idx_photos_user_state_created')
    await knex.raw('DROP INDEX IF EXISTS idx_photos_hash')
    return
  }

  await knex.schema.table('photos', (table) => {
    table.dropIndex(['user_id', 'created_at', 'id'], 'idx_photos_user_created_id')
    table.dropIndex(['user_id', 'state', 'created_at', 'id'], 'idx_photos_user_state_created')
    table.dropIndex(['hash'], 'idx_photos_hash')
  })
}
