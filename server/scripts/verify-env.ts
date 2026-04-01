import dns from 'dns/promises';
import knexFactory from 'knex';

import '../env';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function verifyEnv(): Promise<void> {
  console.log('🔍 Verifying Environment Configuration...\n');
  let hasErrors = false;

  if (!process.env.DATABASE_URL) {
    console.error(`${RED}❌ Error: DATABASE_URL is missing in .env${RESET}`);
    hasErrors = true;
  } else {
    console.log(`${GREEN}✅ DATABASE_URL is present${RESET}`);
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase.co')) {
    const url = new URL(process.env.DATABASE_URL);
    const hostname = url.hostname;
    const port = url.port;

    console.log(`   Target Host: ${hostname}`);
    console.log(`   Target Port: ${port}`);

    if (port === '5432') {
      console.warn(`${YELLOW}⚠️  Warning: You are using port 5432 for Supabase.${RESET}`);
      console.warn(`${YELLOW}   This connects directly to the database and may be IPv6-only.${RESET}`);
      console.warn(`${YELLOW}   If you are on an IPv4-only network (like many corporate/public Wi-Fis), this will TIMEOUT.${RESET}`);
      console.warn(`${YELLOW}   Recommendation: Use the Connection Pooler URL (port 6543).${RESET}\n`);

      try {
        const addresses = await dns.resolve(hostname);
        console.log(`   DNS Resolution: ${JSON.stringify(addresses)}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`   Could not resolve hostname: ${message}`);
      }
    } else if (port === '6543') {
      console.log(`${GREEN}✅ Using Supabase Connection Pooler (port 6543) - IPv4 Compatible${RESET}`);
    }
  }

  if (process.env.DATABASE_URL) {
    console.log('\nTesting Database Connection...');
    const isSupabase = process.env.DATABASE_URL.includes('supabase');
    const sslConfig = isSupabase ? { rejectUnauthorized: false } : false;

    const db = knexFactory({
      client: 'pg',
      connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: sslConfig,
      },
      acquireConnectionTimeout: 5_000,
    });

    try {
      await db.raw('SELECT 1');
      console.log(`${GREEN}✅ Database Connection Successful!${RESET}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${RED}❌ Database Connection Failed:${RESET} ${message}`);
      if (message.includes('SSL')) {
        console.error(`${YELLOW}   Hint: Check your SSL settings. Supabase requires SSL.${RESET}`);
      } else if (message.includes('timeout')) {
        console.error(`${YELLOW}   Hint: Connection timed out. If using Supabase, check if you are blocked by IPv6 issues (use port 6543).${RESET}`);
      }
      hasErrors = true;
    } finally {
      await db.destroy();
    }
  }

  if (hasErrors) {
    console.error(`\n${RED}❌ Environment verification failed. Please fix the issues above.${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}✨ Environment verification passed!${RESET}`);
  process.exit(0);
}

void verifyEnv();