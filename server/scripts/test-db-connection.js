#!/usr/bin/env node
// server/scripts/test-db-connection.js
// Simple dev-only Postgres smoke test. Exits 0 on success, non-zero on failure.
const path = require('path');
// make sure env is loaded
require(path.join(__dirname, '..', 'env'));
const { Client } = require('pg');

(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error('[test-db] Missing SUPABASE_DB_URL in server/.env');
    process.exit(1);
  }

  const isSslDisabled = String(process.env.DB_SSL_DISABLED || '').trim().toLowerCase() === 'true';
  // Use ssl.rejectUnauthorized=false for common managed PG hosts (Supabase).
  const client = new Client({
    connectionString: url,
    ssl: isSslDisabled ? false : { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    const { rows } = await client.query('SELECT 1 AS ok;');
    console.log('[test-db] DB OK:', rows);
    process.exit(0);
  } catch (err) {
    console.error('[test-db] DB FAIL:', err && err.message ? err.message : err);
    process.exit(2);
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
})();
