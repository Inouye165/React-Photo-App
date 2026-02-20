/*
 * Verifies local Supabase realtime prerequisites for chat + multiplayer games.
 *
 * Usage:
 *   npm --prefix server run test:realtime:db
 *
 * Reads SUPABASE_DB_URL (or DATABASE_URL) from env.
 */

const { Client } = require('pg');

const REQUIRED_TABLES = [
  'messages',
  'room_members',
  'rooms',
  'chess_moves',
  'games',
  'game_members',
];

const RLS_TABLES = [
  'messages',
  'room_members',
  'rooms',
  'chess_moves',
  'games',
  'game_members',
];

async function fetchPublicationTables(client) {
  const { rows } = await client.query(`
    select tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
    order by tablename
  `);
  return rows.map((row) => row.tablename);
}

async function fetchRlsState(client) {
  const { rows } = await client.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any($1)
    order by c.relname
  `, [RLS_TABLES]);
  return rows;
}

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing SUPABASE_DB_URL or DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: false });

  try {
    await client.connect();

    const publicationTables = await fetchPublicationTables(client);
    const missingTables = REQUIRED_TABLES.filter((table) => !publicationTables.includes(table));
    if (missingTables.length > 0) {
      throw new Error(`supabase_realtime missing tables: ${missingTables.join(', ')}`);
    }

    const rlsState = await fetchRlsState(client);
    const byName = new Map(rlsState.map((row) => [row.table_name, row]));

    const missingRlsRows = RLS_TABLES.filter((table) => !byName.has(table));
    if (missingRlsRows.length > 0) {
      throw new Error(`RLS state missing rows for tables: ${missingRlsRows.join(', ')}`);
    }

    const invalidRls = RLS_TABLES.filter((table) => {
      const row = byName.get(table);
      return !row || row.rls_enabled !== true || row.force_rls !== false;
    });

    if (invalidRls.length > 0) {
      throw new Error(`Unexpected RLS mode (expected rls_enabled=true and force_rls=false): ${invalidRls.join(', ')}`);
    }

    console.log('✅ Supabase realtime publication + RLS setup verified');
    console.log(`   tables: ${REQUIRED_TABLES.join(', ')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Realtime setup verification failed: ${message}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
