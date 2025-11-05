# Integration Test Fix - November 5, 2025

## Original Issue

Integration tests were failing with **"Health timeout"** error. The tests would start the server, but the health check endpoint would never respond, causing the test to timeout after 10-12 seconds.

### Root Cause Analysis

The server has conditional listening logic in `server/server.js` line 222:

```javascript
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Photo upload server running on port ${PORT}`);
  });
}
```

**Why this exists:** Unit tests use `supertest` which doesn't need the server to actually listen on a port. Supertest creates its own HTTP server instance. So `NODE_ENV=test` prevents the server from binding to a port to avoid conflicts.

**The problem:** Integration tests (`scripts/integration-test.cjs`) spawn the server as a separate process and make real HTTP requests to `localhost:3001`. If the server doesn't listen, these requests fail with connection refused, causing the health check to timeout.

### Initial Setup

The CI workflows were using `NODE_ENV=test` for integration tests:

```yaml
# .github/workflows/ci.yml and integration.yml (BEFORE)
- name: Run integration test
  env:
    NODE_ENV: test  # ❌ This prevents server from listening!
    SUPABASE_URL: https://test.supabase.co
    # ... other vars
```

## The Multi-Step Fix

### 1. Change NODE_ENV for Integration Tests

**File:** `.github/workflows/ci.yml`, `.github/workflows/integration.yml`

Changed integration test step to use `NODE_ENV=development`:

```yaml
- name: Run integration test
  env:
    NODE_ENV: development  # ✅ Server will now listen
    USE_POSTGRES_AUTO_DETECT: "false"  # Prevent Postgres detection
    DB_PATH: ":memory:"
    ALLOW_SQLITE_FALLBACK: "true"
    SUPABASE_URL: https://test.supabase.co
    SUPABASE_SERVICE_ROLE_KEY: test-service-role-key
    SUPABASE_ANON_KEY: test-anon-key  # Also added (was missing)
    # ... other vars
```

### 2. Honor ALLOW_SQLITE_FALLBACK Environment Variable

**File:** `server/db/index.js`

The database module was only allowing sqlite in `NODE_ENV=test`, but now we need it to work in `development` mode too:

```javascript
// BEFORE
if (environment === 'test') {
  logger.info('[db] Test environment detected: using sqlite in-memory fallback for tests');
  db = knex(knexConfig.test);
} else {
  throw new Error('[db] Postgres/Supabase not configured...');
}

// AFTER
if (environment === 'test' || process.env.ALLOW_SQLITE_FALLBACK === 'true') {
  logger.info('[db] Using sqlite in-memory fallback (test or explicitly allowed)');
  db = knex(knexConfig.test);
} else {
  throw new Error('[db] Postgres/Supabase not configured...');
}
```

### 3. Auto-Run Migrations for In-Memory Databases

**File:** `server/db/index.js`

In-memory sqlite databases (`:memory:`) start completely empty. Each process gets its own isolated in-memory database. We can't run migrations in a separate process because they'd run against a different database instance.

**Solution:** Auto-run migrations when the server starts with an in-memory database:

```javascript
if (environment === 'test' || process.env.ALLOW_SQLITE_FALLBACK === 'true') {
  logger.info('[db] Using sqlite in-memory fallback (test or explicitly allowed)');
  db = knex(knexConfig.test);
  
  // Auto-run migrations for in-memory databases since they start empty
  if (knexConfig.test.connection === ':memory:') {
    logger.info('[db] Running migrations for in-memory database...');
    db.migrate.latest()
      .then(() => logger.info('[db] Migrations completed'))
      .catch(err => {
        logger.error('[db] Migration error:', err);
        throw err;
      });
  }
}
```

### 4. Add Missing SUPABASE_ANON_KEY

**File:** `.github/workflows/integration.yml`

The server's startup diagnostics check for `SUPABASE_ANON_KEY`. It was present in `ci.yml` but missing in `integration.yml`:

```yaml
env:
  SUPABASE_ANON_KEY: test-anon-key  # Added
```

## Configuration Summary

For integration tests to work, these environment variables are required:

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `development` | Allows server to listen on port |
| `USE_POSTGRES_AUTO_DETECT` | `false` | Prevents auto-detecting Postgres |
| `ALLOW_SQLITE_FALLBACK` | `true` | Allows sqlite in development mode |
| `DB_PATH` | `:memory:` | Uses in-memory database |
| `SUPABASE_ANON_KEY` | `test-anon-key` | Required for server diagnostics |
| `SUPABASE_SERVICE_ROLE_KEY` | `test-service-role-key` | Mock Supabase credential |
| `SUPABASE_URL` | `https://test.supabase.co` | Mock Supabase URL |
| `JWT_SECRET` | `test-jwt-secret-key-for-testing-only` | For authentication tests |

## Regression Prevention

Created test file: `server/tests/server-listening.test.js`

This test verifies:
1. Server does NOT listen when `NODE_ENV=test` (for unit tests)
2. Integration test workflows use `NODE_ENV=development` (not test)
3. `ALLOW_SQLITE_FALLBACK` is checked in `db/index.js`
4. Migrations auto-run for `:memory:` databases
5. Required environment variables are present in workflow files

## Related Issues

This same pattern may have occurred before. The key insight is:

- **Unit tests** (with supertest): Use `NODE_ENV=test`, server doesn't listen
- **Integration tests** (real HTTP): Use `NODE_ENV=development`, server must listen

Any future integration test setup must use `NODE_ENV` that allows listening (development, production, etc.) combined with appropriate database configuration flags.

## Testing the Fix

All three CI workflows now pass:
- ✅ CI (runs unit tests + integration test)
- ✅ Integration Test (standalone)
- ✅ Secret Scan & Security

The fix is verified in GitHub Actions run IDs:
- CI: 19112107424
- Integration Test: 19112107464
- Secret Scan: 19112107484

## Files Modified

1. `.github/workflows/ci.yml` - Changed NODE_ENV, added ALLOW_SQLITE_FALLBACK
2. `.github/workflows/integration.yml` - Changed NODE_ENV, added ALLOW_SQLITE_FALLBACK and SUPABASE_ANON_KEY
3. `server/db/index.js` - Honor ALLOW_SQLITE_FALLBACK, auto-run migrations for :memory:
4. `server/tests/server-listening.test.js` - New regression test (created)
