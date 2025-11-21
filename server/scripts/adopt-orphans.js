// server/scripts/adopt-orphans.js

require('../env'); // Load environment variables from server/.env
const knexConfig = require('../knexfile');
const knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
console.log('DB Client:', knex.client.config.client);

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Usage: node adopt-orphans.js <userId>');
    process.exit(1);
  }

  // Check if user exists
  const user = await knex('users').where({ id: userId }).first();
  if (!user) {
    console.error(`User with id ${userId} does not exist.`);
    process.exit(1);
  }

  // Count orphan photos
  const orphanCount = await knex('photos').whereNull('user_id').count('id as count').first();
  const count = Number(orphanCount.count || 0);
  if (count === 0) {
    console.log('No orphan photos found.');
    process.exit(0);
  }

  // Update orphan photos
  const updated = await knex('photos').whereNull('user_id').update({ user_id: userId });
  console.log(`Updated ${updated} orphan photos to user_id ${userId}.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
