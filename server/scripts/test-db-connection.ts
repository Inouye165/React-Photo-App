#!/usr/bin/env node
// server/scripts/test-db-connection.ts
// Simple dev-only Postgres smoke test. Exits 0 on success, non-zero on failure.

import { Client } from 'pg';

import '../env';

async function main(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error('[test-db] Missing SUPABASE_DB_URL in server/.env');
    process.exit(1);
  }

  const isSslDisabled = String(process.env.DB_SSL_DISABLED || '').trim().toLowerCase() === 'true';
  const client = new Client({
    connectionString: url,
    ssl: isSslDisabled ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const { rows } = await client.query<{ ok: number }>('SELECT 1 AS ok;');
    console.log('[test-db] DB OK:', rows);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[test-db] DB FAIL:', message);
    process.exit(2);
  } finally {
    try {
      await client.end();
    } catch {
      // ignore cleanup errors
    }
  }
}

void main();