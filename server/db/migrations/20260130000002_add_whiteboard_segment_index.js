// server/db/migrations/20260130000002_add_whiteboard_segment_index.js

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('whiteboard_events')
  if (!hasTable) return

  const hasColumn = await knex.schema.hasColumn('whiteboard_events', 'segment_index')
  if (!hasColumn) {
    await knex.schema.alterTable('whiteboard_events', (table) => {
      table.integer('segment_index')
    })
  }

  await knex.schema.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS whiteboard_events_segment_idx ON whiteboard_events (board_id, stroke_id, segment_index)'
  )
}

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('whiteboard_events')
  if (!hasTable) return

  await knex.schema.raw('DROP INDEX IF EXISTS whiteboard_events_segment_idx')

  const hasColumn = await knex.schema.hasColumn('whiteboard_events', 'segment_index')
  if (hasColumn) {
    await knex.schema.alterTable('whiteboard_events', (table) => {
      table.dropColumn('segment_index')
    })
  }
}
