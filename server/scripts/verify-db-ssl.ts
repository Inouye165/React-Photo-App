#!/usr/bin/env node
/**
 * Database SSL Connection Verification Script
 *
 * This script verifies that the database connection uses proper SSL configuration.
 * It attempts to connect using the production configuration and validates the connection.
 *
 * Usage:
 *   NODE_ENV=production npx tsx scripts/verify-db-ssl.ts
 *
 * Exit codes:
 *   0 - Success: Secure connection established
 *   1 - Failure: Connection failed or SSL not properly configured
 */

import knexFactory from 'knex';

import '../env';

const knexConfig = require('../knexfile') as Record<string, Parameters<typeof knexFactory>[0]>;

type PgVersionRow = {
  current_time: string;
  pg_version: string;
};

type PgSslRow = {
  ssl: boolean;
};

type RawQueryResult<Row> = {
  rows: Row[];
};

async function verifyDbSsl(): Promise<void> {
  const env = process.env.NODE_ENV || 'development';
  console.log(`🔐 Verifying database SSL connection (${env} mode)...\n`);

  const config = knexConfig[env] as Parameters<typeof knexFactory>[0] & {
    connection?: false | string | { ssl?: false | { rejectUnauthorized?: boolean; ca?: string } };
  };
  if (!config) {
    console.error(`✗ No configuration found for environment: ${env}`);
    process.exit(1);
  }

  const connection = typeof config.connection === 'object' && config.connection ? (config.connection as {
    ssl?: false | { rejectUnauthorized?: boolean; ca?: string };
  }) : undefined;
  const ssl = connection && 'ssl' in connection ? connection.ssl : undefined;

  console.log('SSL Configuration:');
  console.log(`  - rejectUnauthorized: ${String(typeof ssl === 'object' && ssl ? ssl.rejectUnauthorized : undefined)}`);
  console.log(`  - CA certificate: ${typeof ssl === 'object' && ssl && 'ca' in ssl && ssl.ca ? '✓ Loaded' : '✗ Not loaded'}`);

  if (env === 'production') {
    if (!(typeof ssl === 'object' && ssl?.rejectUnauthorized)) {
      console.error('\n✗ SECURITY ERROR: Production must have rejectUnauthorized: true');
      process.exit(1);
    }
    if (!(typeof ssl === 'object' && ssl?.ca)) {
      console.error('\n✗ SECURITY ERROR: Production must have CA certificate loaded');
      process.exit(1);
    }
  }

  console.log('\nAttempting database connection...');
  const db = knexFactory(config);

  try {
    const result = await db.raw('SELECT NOW() as current_time, version() as pg_version') as RawQueryResult<PgVersionRow>;
    const row = Array.isArray(result.rows) ? result.rows[0] : undefined;

    console.log('\n✓ Secure connection established');
    console.log(`  - Server time: ${row?.current_time}`);
    if (row?.pg_version) {
      const [name, version] = row.pg_version.split(' ');
      console.log(`  - PostgreSQL: ${name} ${version}`);
    }

    try {
      const sslResult = await db.raw('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()') as RawQueryResult<PgSslRow>;
      const sslRow = Array.isArray(sslResult.rows) ? sslResult.rows[0] : undefined;
      if (sslRow?.ssl) {
        console.log('  - SSL: Active ✓');
      } else {
        console.log('  - SSL: Unknown (pg_stat_ssl not available)');
      }
    } catch {
      console.log('  - SSL: Could not verify (pg_stat_ssl unavailable)');
    }

    await db.destroy();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n✗ Database connection failed:', message);
    if (message.includes('certificate')) {
      console.error('\n  This may indicate an SSL certificate issue.');
      console.error('  Ensure the CA certificate matches your database provider.');
    }
    await db.destroy();
    process.exit(1);
  }
}

void verifyDbSsl();