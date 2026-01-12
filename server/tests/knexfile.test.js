/**
 * Unit tests for knexfile.js SSL configuration
 * Verifies strict SSL enforcement in production and flexibility in development
 */

const path = require('path');
const fs = require('fs');

const getTrackedEnvSnapshot = () => ({
  DB_POOL_MIN: process.env.DB_POOL_MIN,
  DB_POOL_MAX: process.env.DB_POOL_MAX,
  DB_POOL_ACQUIRE_TIMEOUT: process.env.DB_POOL_ACQUIRE_TIMEOUT,
  DB_POOL_IDLE_TIMEOUT: process.env.DB_POOL_IDLE_TIMEOUT,
  DB_SSL_REJECT_UNAUTHORIZED: process.env.DB_SSL_REJECT_UNAUTHORIZED
});

const restoreTrackedEnv = (snapshot) => {
  const keys = Object.keys(snapshot);
  for (const key of keys) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const applyTrackedEnv = (updates) => {
  const keys = Object.keys(updates);
  for (const key of keys) {
    const value = updates[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
};

// Helper to reload knexfile with fresh module cache
const loadKnexfile = () => {
  // Use Jest's module isolation to avoid cross-suite module cache effects.
  jest.resetModules();
  let loaded = null;
  jest.isolateModules(() => {
    loaded = require('../knexfile.js');
  });
  return loaded;
};

describe('knexfile.js SSL configuration', () => {
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = getTrackedEnvSnapshot();
    applyTrackedEnv({
      DB_POOL_MIN: undefined,
      DB_POOL_MAX: undefined,
      DB_POOL_ACQUIRE_TIMEOUT: undefined,
      DB_POOL_IDLE_TIMEOUT: undefined,
      DB_SSL_REJECT_UNAUTHORIZED: undefined
    });
  });

  afterEach(() => {
    restoreTrackedEnv(envSnapshot);
  });

  describe('Pool configuration', () => {
    it('should apply defaults when env vars are missing', () => {
      const knexfile = loadKnexfile();

      expect(knexfile.development.pool.min).toBe(2);
      expect(knexfile.development.pool.max).toBe(30);
      expect(knexfile.development.pool.acquireTimeoutMillis).toBe(60000);
      expect(knexfile.development.pool.idleTimeoutMillis).toBe(30000);
    });

    it('should allow env vars to override pool settings', () => {
      applyTrackedEnv({
        DB_POOL_MIN: '1',
        DB_POOL_MAX: '10',
        DB_POOL_ACQUIRE_TIMEOUT: '12345',
        DB_POOL_IDLE_TIMEOUT: '54321'
      });

      const knexfile = loadKnexfile();

      expect(knexfile.production.pool.min).toBe(1);
      expect(knexfile.production.pool.max).toBe(10);
      expect(knexfile.production.pool.acquireTimeoutMillis).toBe(12345);
      expect(knexfile.production.pool.idleTimeoutMillis).toBe(54321);
    });
  });

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
      // IMPORTANT: This test runs in parallel with other Jest worker processes.
      // Renaming the real CA cert file can race other tests that require knexfile,
      // causing intermittent failures. Instead, mock fs.existsSync.
      jest.resetModules();
      jest.doMock('fs', () => {
        const actualFs = jest.requireActual('fs');
        return {
          ...actualFs,
          existsSync: () => false
        };
      });

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

      jest.dontMock('fs');
      jest.resetModules();
    });

    it('should allow external pooler mode when DB_SSL_REJECT_UNAUTHORIZED=false', () => {
      applyTrackedEnv({ DB_SSL_REJECT_UNAUTHORIZED: 'false' });
      const knexfile = loadKnexfile();

      expect(knexfile.production.connection.ssl.rejectUnauthorized).toBe(false);
      expect(knexfile.production.connection.ssl.ca).toBeUndefined();
    });

    it('should NOT attempt to load CA file in external pooler mode', () => {
      applyTrackedEnv({ DB_SSL_REJECT_UNAUTHORIZED: 'false' });

      jest.resetModules();
      jest.doMock('fs', () => {
        const actualFs = jest.requireActual('fs');
        return {
          ...actualFs,
          existsSync: () => false,
          readFileSync: () => {
            throw new Error('Unexpected CA load');
          }
        };
      });

      let loadError = null;
      jest.isolateModules(() => {
        try {
          require('../knexfile.js');
        } catch (e) {
          loadError = e;
        }
      });

      expect(loadError).toBeNull();

      jest.dontMock('fs');
      jest.resetModules();
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
