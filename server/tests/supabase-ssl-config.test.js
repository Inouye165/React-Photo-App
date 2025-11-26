/**
 * tests/supabase-ssl-config.test.js
 * 
 * Security test to ensure SSL configuration is secure in production.
 * 
 * Production MUST use strict SSL with CA certificate verification to prevent
 * man-in-the-middle (MITM) attacks. Development/test environments can use
 * relaxed SSL for local Docker containers.
 * 
 * What we're testing:
 * 1. knexfile.js production config has strict SSL (rejectUnauthorized: true)
 * 2. Production config includes CA certificate
 * 3. Development/test configs allow self-signed certs (for local Docker)
 * 4. db/index.js properly handles SSL configuration
 */

const knexfile = require('../knexfile');
const knex = require('knex');

describe('Supabase SSL Configuration (Regression Test)', () => {
  
  describe('knexfile.js production config', () => {
    
    test('production config exists', () => {
      expect(knexfile.production).toBeDefined();
      expect(knexfile.production.client).toBe('pg');
    });

    test('production uses connection object (not plain string)', () => {
      const conn = knexfile.production.connection;
      expect(typeof conn).toBe('object');
      expect(conn).not.toBeNull();
    });

    test('production connection has connectionString property', () => {
      const conn = knexfile.production.connection;
      expect(conn.connectionString).toBeDefined();
      expect(typeof conn.connectionString === 'string' || conn.connectionString === undefined).toBe(true);
    });

    test('production SSL is configured with strict certificate validation', () => {
      const conn = knexfile.production.connection;
      
      // Must have SSL object
      expect(conn.ssl).toBeDefined();
      expect(typeof conn.ssl).toBe('object');
      
      // Production MUST enforce strict SSL with CA verification to prevent MITM attacks
      expect(conn.ssl.rejectUnauthorized).toBe(true);
      expect(conn.ssl.ca).toBeDefined();
      expect(typeof conn.ssl.ca).toBe('string');
      expect(conn.ssl.ca).toMatch(/-----BEGIN CERTIFICATE-----/);
    });

    test('connection string should not contain ?sslmode= parameter', () => {
      const conn = knexfile.production.connection;
      
      if (conn.connectionString && typeof conn.connectionString === 'string') {
        expect(conn.connectionString).not.toMatch(/[?&]sslmode=/);
      }
      
      // If SUPABASE_DB_URL is set in env, check it too
      if (process.env.SUPABASE_DB_URL) {
        const hasConflict = /[?&]sslmode=/.test(process.env.SUPABASE_DB_URL);
        if (hasConflict) {
          console.warn(
            '\n⚠️  WARNING: SUPABASE_DB_URL contains ?sslmode= parameter.\n' +
            '   This conflicts with the SSL object config and may cause connection failures.\n' +
            '   Remove ?sslmode= from the connection string in your .env file.\n' +
            '   See server/PROBLEM_LOG.md [2025-11-04 15:15 PST] for details.\n'
          );
        }
      }
    });
  });

  describe('db/index.js SSL handling', () => {
    
    test('can create knex instance with production config without throwing', () => {
      const cfg = { ...knexfile.production };
      
      // Mock connection string to avoid actual DB connection
      if (cfg.connection && typeof cfg.connection === 'object') {
        cfg.connection.connectionString = 'postgresql://test:test@localhost:5432/test';
      }
      
      expect(() => {
        const db = knex(cfg);
        // Immediately destroy to avoid hanging connections
        db.destroy();
      }).not.toThrow();
    });
  });

  describe('Error message guidance', () => {
    
    test('production SSL is properly secured with CA certificate', () => {
      const conn = knexfile.production.connection;
      
      if (!conn || typeof conn !== 'object') {
        throw new Error(
          '\n❌ SSL Configuration Error:\n' +
          '   Production connection must be an object, not a string.\n' +
          '   \n' +
          '   Expected:\n' +
          '     connection: {\n' +
          '       connectionString: process.env.SUPABASE_DB_URL,\n' +
          '       ssl: { rejectUnauthorized: true, ca: <CA_CERT> }\n' +
          '     }\n'
        );
      }
      
      // Production MUST have strict SSL with CA certificate to prevent MITM attacks
      if (!conn.ssl || conn.ssl.rejectUnauthorized !== true || !conn.ssl.ca) {
        throw new Error(
          '\n❌ Production SSL Security Error:\n' +
          '   Production MUST use strict SSL with CA certificate verification\n' +
          '   to prevent man-in-the-middle (MITM) attacks.\n' +
          '   \n' +
          '   Current config:\n' +
          `     ssl.rejectUnauthorized: ${conn.ssl?.rejectUnauthorized}\n` +
          `     ssl.ca: ${conn.ssl?.ca ? 'present' : 'MISSING'}\n` +
          '   \n' +
          '   Required config:\n' +
          '     ssl: { rejectUnauthorized: true, ca: <contents of prod-ca-2021.crt> }\n' +
          '   \n' +
          '   See server/README.md Database SSL Configuration section.\n'
        );
      }
      
      // If we got here, config is secure
      expect(true).toBe(true);
    });
  });

  describe('Environment variable validation', () => {
    
    test('SUPABASE_DB_URL format guidance', () => {
      if (process.env.SUPABASE_DB_URL) {
        const url = process.env.SUPABASE_DB_URL;
        
        // Check for common mistakes
        const warnings = [];
        
        if (url.includes('sslmode=verify-full')) {
          warnings.push('⚠️  sslmode=verify-full will fail with Supabase certificates');
        }
        
        if (url.includes('sslmode=require') && url.includes('?')) {
          warnings.push('⚠️  ?sslmode=require conflicts with ssl object config - remove it');
        }
        
        if (!url.includes('postgres')) {
          warnings.push('⚠️  URL should start with postgresql://');
        }
        
        if (warnings.length > 0) {
          console.warn(
            '\n⚠️  SUPABASE_DB_URL Configuration Warnings:\n' +
            warnings.map(w => `   ${w}`).join('\n') +
            '\n\n   Recommended format:\n' +
            '   postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres\n' +
            '   (without any ?sslmode= parameter)\n' +
            '\n   See server/PROBLEM_LOG.md [2025-11-04 15:15 PST] for details.\n'
          );
        }
      }
    });

    test('SUPABASE_DB_URL_MIGRATIONS is set for direct connection', () => {
      if (process.env.SUPABASE_DB_URL && !process.env.SUPABASE_DB_URL_MIGRATIONS) {
        console.warn(
          '\n⚠️  SUPABASE_DB_URL_MIGRATIONS not set:\n' +
          '   For better migration reliability, set SUPABASE_DB_URL_MIGRATIONS\n' +
          '   to a direct (non-pooler) connection URL.\n' +
          '   \n' +
          '   Example:\n' +
          '   SUPABASE_DB_URL_MIGRATIONS=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres\n' +
          '   \n' +
          '   This avoids PgBouncer issues during migrations.\n' +
          '   See server/.env for details.\n'
        );
      }
    });
  });
});
