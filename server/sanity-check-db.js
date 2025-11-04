// Load the project's server/.env the same way the app does
require('./env');
const { Client } = require('pg');
const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('No SUPABASE_DB_URL / DATABASE_URL set in environment.');
  process.exit(2);
}

const client = new Client({ connectionString: url });
(async () => {
  try {
    await client.connect();
    const res = await client.query('select now()');
    console.log('DB OK', res.rows);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('DB connect error:');
    console.error(err);
    try { await client.end(); } catch { /* ignore cleanup errors */ }
    process.exit(1);
  }
})();