// scripts/reset-ai-retry.cjs
// Usage: node scripts/reset-ai-retry.cjs <photoId>

// Load environment variables from server/.env
require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });

const db = require('../server/db');

async function main() {
  const photoId = process.argv[2];
  if (!photoId) {
    console.error('Usage: node scripts/reset-ai-retry.cjs <photoId>');
    process.exit(1);
  }
  const updated = await db('photos').where({ id: photoId }).update({ ai_retry_count: 0 });
  if (updated) {
    console.log(`ai_retry_count reset to 0 for photoId ${photoId}`);
  } else {
    console.error(`No photo found with id ${photoId}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Error resetting ai_retry_count:', err);
  process.exit(1);
});
