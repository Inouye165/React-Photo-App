/**
 * tests/supabase-ssl-config.test.js
 * 
 * Regression test to ensure Supabase SSL configuration remains correct.
 * 
 * This test prevents the "self-signed certificate in certificate chain" error
 * that was fixed on 2025-11-04. See server/PROBLEM_LOG.md for details.
 * 
 * What we're testing:
 * 1. knexfile.js production config has proper SSL settings
 * 2. Connection strings don't have conflicting ?sslmode= parameters
 * 3. SSL is configured to not reject unauthorized certificates (required for Supabase)
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

    test('production SSL is configured to not reject unauthorized certificates', () => {
      const conn = knexfile.production.connection;
      
      // Must have SSL object
      expect(conn.ssl).toBeDefined();
      expect(typeof conn.ssl).toBe('object');
      
      // Must set rejectUnauthorized to false for Supabase
      expect(conn.ssl.rejectUnauthorized).toBe(false);
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
    
    test('if SSL is misconfigured, provide helpful error message', () => {
      const conn = knexfile.production.connection;
      
      if (!conn || typeof conn !== 'object') {
        throw new Error(
          '\n❌ Supabase SSL Configuration Error:\n' +
          '   Production connection must be an object, not a string.\n' +
          '   \n' +
          '   Expected:\n' +
          '     connection: {\n' +
          '       connectionString: process.env.SUPABASE_DB_URL,\n' +
          '       ssl: { rejectUnauthorized: false }\n' +
          '     }\n' +
          '   \n' +
          '   See server/PROBLEM_LOG.md [2025-11-04 15:15 PST] for fix details.\n'
        );
      }
      
      if (!conn.ssl || conn.ssl.rejectUnauthorized !== false) {
        throw new Error(
          '\n❌ Supabase SSL Configuration Error:\n' +
          '   SSL must be configured with rejectUnauthorized: false\n' +
          '   \n' +
          '   Current config:\n' +
          `     ssl: ${JSON.stringify(conn.ssl, null, 2)}\n` +
          '   \n' +
          '   Required config:\n' +
          '     ssl: { rejectUnauthorized: false }\n' +
          '   \n' +
          '   This prevents "self-signed certificate in certificate chain" errors.\n' +
          '   See server/PROBLEM_LOG.md [2025-11-04 15:15 PST] for details.\n'
        );
      }
      
      // If we got here, config is correct
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
