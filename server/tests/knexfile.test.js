/**
 * Unit tests for knexfile.js SSL configuration
 * Verifies strict SSL enforcement in production and flexibility in development
 */

const path = require('path');
const fs = require('fs');

// Helper to reload knexfile with fresh module cache
const loadKnexfile = () => {
  // Clear module cache for knexfile and env
  const knexfilePath = require.resolve('../knexfile.js');
  const envPath = require.resolve('../env.js');
  delete require.cache[knexfilePath];
  delete require.cache[envPath];
  return require('../knexfile.js');
};

describe('knexfile.js SSL configuration', () => {
  describe('Production environment', () => {
    it('should enforce strict SSL with rejectUnauthorized: true', () => {
      const knexfile = loadKnexfile();
      expect(knexfile.production.connection.ssl.rejectUnauthorized).toBe(true);
    });

    it('should include CA certificate in production config', () => {
      const knexfile = loadKnexfile();
      expect(knexfile.production.connection.ssl.ca).toBeDefined();
      expect(typeof knexfile.production.connection.ssl.ca).toBe('string');
      expect(knexfile.production.connection.ssl.ca.length).toBeGreaterThan(0);
    });

    it('should load the correct CA certificate file', () => {
      const knexfile = loadKnexfile();
      const expectedCertPath = path.join(__dirname, '..', 'prod-ca-2021.crt');
      const expectedCert = fs.readFileSync(expectedCertPath, 'utf8');
      expect(knexfile.production.connection.ssl.ca).toBe(expectedCert);
    });

    it('should throw error if CA certificate file is missing', () => {
      const certPath = path.join(__dirname, '..', 'prod-ca-2021.crt');
      const backupPath = certPath + '.backup';
      
      // Temporarily rename cert file
      fs.renameSync(certPath, backupPath);
      
      try {
        // Use jest.isolateModules for fresh require
        let loadError = null;
        jest.isolateModules(() => {
          try {
            require('../knexfile.js');
          } catch (e) {
            loadError = e;
          }
        });
        expect(loadError).not.toBeNull();
        expect(loadError.message).toMatch(/Production CA certificate not found/);
      } finally {
        // Restore cert file
        fs.renameSync(backupPath, certPath);
      }
    });
  });

  describe('Development environment', () => {
    it('should NOT enforce strict SSL (rejectUnauthorized: false)', () => {
      const knexfile = loadKnexfile();
      expect(knexfile.development.connection.ssl.rejectUnauthorized).toBe(false);
    });

    it('should NOT include CA certificate', () => {
      const knexfile = loadKnexfile();
      expect(knexfile.development.connection.ssl.ca).toBeUndefined();
    });
  });

  describe('Test environment', () => {
    it('should NOT enforce strict SSL (rejectUnauthorized: false)', () => {
      const knexfile = loadKnexfile();
      expect(knexfile.test.connection.ssl.rejectUnauthorized).toBe(false);
    });

    it('should NOT include CA certificate', () => {
      const knexfile = loadKnexfile();
      expect(knexfile.test.connection.ssl.ca).toBeUndefined();
    });
  });

  describe('Configuration structure', () => {
    it('should export development, test, and production configurations', () => {
      const knexfile = loadKnexfile();
      expect(knexfile).toHaveProperty('development');
      expect(knexfile).toHaveProperty('test');
      expect(knexfile).toHaveProperty('production');
    });

    it('should use pg client for all environments', () => {
      const knexfile = loadKnexfile();
      expect(knexfile.development.client).toBe('pg');
      expect(knexfile.test.client).toBe('pg');
      expect(knexfile.production.client).toBe('pg');
    });
  });
});
