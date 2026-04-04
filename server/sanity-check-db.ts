import { Client } from 'pg';

import './env';

async function main(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('No SUPABASE_DB_URL / DATABASE_URL set in environment.');
    process.exit(2);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    const result = await client.query<{ now: string }>('select now()');
    console.log('DB OK', result.rows);
    process.exit(0);
  } catch (error: unknown) {
    console.error('DB connect error:');
    console.error(error);
    process.exit(1);
  } finally {
    try {
      await client.end();
    } catch {
      // Ignore cleanup errors.
    }
  }
}

void main();