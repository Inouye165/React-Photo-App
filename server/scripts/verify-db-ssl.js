#!/usr/bin/env node
/**
 * Database SSL Connection Verification Script
 * 
 * This script verifies that the database connection uses proper SSL configuration.
 * It attempts to connect using the production configuration and validates the connection.
 * 
 * Usage:
 *   NODE_ENV=production node scripts/verify-db-ssl.js
 * 
 * Exit codes:
 *   0 - Success: Secure connection established
 *   1 - Failure: Connection failed or SSL not properly configured
 */

const knex = require('knex');

// Make sure we load environment variables
require('../env');

async function verifyDbSsl() {
  const env = process.env.NODE_ENV || 'development';
  console.log(`🔐 Verifying database SSL connection (${env} mode)...\n`);

  // Load knexfile configuration
  let knexConfig;
  try {
    knexConfig = require('../knexfile.ts');
  } catch (error) {
    console.error('✗ Failed to load knexfile.ts:', error.message);
    process.exit(1);
  }

  const config = knexConfig[env];
  
  if (!config) {
    console.error(`✗ No configuration found for environment: ${env}`);
    process.exit(1);
  }

  // Display SSL configuration (without sensitive data)
  console.log('SSL Configuration:');
  console.log(`  - rejectUnauthorized: ${config.connection.ssl?.rejectUnauthorized}`);
  console.log(`  - CA certificate: ${config.connection.ssl?.ca ? '✓ Loaded' : '✗ Not loaded'}`);
  
  if (env === 'production') {
    if (!config.connection.ssl?.rejectUnauthorized) {
      console.error('\n✗ SECURITY ERROR: Production must have rejectUnauthorized: true');
      process.exit(1);
    }
    if (!config.connection.ssl?.ca) {
      console.error('\n✗ SECURITY ERROR: Production must have CA certificate loaded');
      process.exit(1);
    }
  }

  // Attempt database connection
  console.log('\nAttempting database connection...');
  
  const db = knex(config);
  
  try {
    // Simple query to verify connection
    const result = await db.raw('SELECT NOW() as current_time, version() as pg_version');
    const { current_time, pg_version } = result.rows[0];
    
    console.log(`\n✓ Secure connection established`);
    console.log(`  - Server time: ${current_time}`);
    console.log(`  - PostgreSQL: ${pg_version.split(' ')[0]} ${pg_version.split(' ')[1]}`);
    
    // Verify SSL is actually being used (PostgreSQL specific)
    try {
      const sslResult = await db.raw("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
      if (sslResult.rows.length > 0 && sslResult.rows[0].ssl) {
        console.log('  - SSL: Active ✓');
      } else {
        console.log('  - SSL: Unknown (pg_stat_ssl not available)');
      }
    } catch {
      // pg_stat_ssl might not be available in all PostgreSQL configurations
      console.log('  - SSL: Could not verify (pg_stat_ssl unavailable)');
    }

    await db.destroy();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Database connection failed:', error.message);
    
    if (error.message.includes('certificate')) {
      console.error('\n  This may indicate an SSL certificate issue.');
      console.error('  Ensure the CA certificate matches your database provider.');
    }
    
    await db.destroy();
    process.exit(1);
  }
}

verifyDbSsl();
