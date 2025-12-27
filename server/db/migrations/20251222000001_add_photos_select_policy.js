// 20251222000001_add_photos_select_policy.js
// Add RLS SELECT policy for photos table to allow users to view their own photos

exports.up = async function(knex) {
  // Allow authenticated users to SELECT their own photos (Postgres only)
  if (knex.client.config.client === 'pg') {
    await knex.raw(`
      CREATE POLICY photos_select_own ON photos
        FOR SELECT
        USING (user_id = auth.uid());
    `);
  }
};

exports.down = async function(knex) {
  if (knex.client.config.client === 'pg') {
    await knex.raw('DROP POLICY IF EXISTS photos_select_own ON photos;');
  }
};
