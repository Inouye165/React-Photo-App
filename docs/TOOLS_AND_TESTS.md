# Tools and Tests Documentation

This document lists the various scripts, tools, and tests available in the `React-Photo-App` repository. Use this as a reference to understand what each tool does and when to use it.

## Environment & Setup Tools

| Script | Location | Purpose | Created |
| :--- | :--- | :--- | :--- |
| `verify-env.js` | `server/scripts/` | **Pre-flight Check:** Verifies `DATABASE_URL`, checks for IPv6/IPv4 compatibility (Supabase Pooler), and tests DB connection with correct SSL settings. Run this if you have connection issues. | Dec 2025 |
| `test-db-connection.js` | `server/scripts/` | **Diagnostic:** A standalone script to test raw Knex connection to the database. Useful for debugging SSL handshake errors. | Dec 2025 |
| `verify-db-ssl.js` | `server/scripts/` | **Diagnostic:** Specifically checks SSL configuration against the database. | Nov 2025 |
| `populate-server-env.ps1` | `scripts/` | **Setup:** PowerShell script to help populate the server environment variables. | - |
| `prepare.cjs` | `scripts/` | **Setup:** Runs `husky install` to set up git hooks. | - |

## Testing Scripts

| Script | Location | Purpose |
| :--- | :--- | :--- |
| `integration-test.cjs` | `scripts/` | **Integration:** Runs the full integration test suite. |
| `docker-smoke.js` | `scripts/` | **Smoke Test:** Verifies that the Docker containers are up and running correctly. |
| `stress-test.cjs` | `scripts/` | **Performance:** Runs a stress test against the server to check for rate limiting and load handling. |
| `check-privilege.cjs` | `scripts/` | **Security:** Checks for privilege escalation vulnerabilities. |
| `secret-scan.cjs` | `scripts/` | **Security:** Scans the codebase for accidentally committed secrets. |
| `deadcode-scan.cjs` | `scripts/` | **Maintenance:** Scans for unused code or exports. |

## Database & Migration Tools

| Script | Location | Purpose |
| :--- | :--- | :--- |
| `check-migrations.js` | `server/scripts/` | **Verification:** Checks if the local migration files match the `knex_migrations` table in the DB. Runs automatically before `npm start`. |
| `adopt-orphans.js` | `server/scripts/` | **Maintenance:** Helper to fix orphaned migration records in the database. |
| `backfill-gps.js` | `scripts/` | **Data:** Backfills GPS data for photos that are missing it. |
| `inspect-exif.js` | `server/scripts/` | **Debug:** Inspects EXIF data of a specific photo file. |

## How to Use

### Verify Environment
If you are setting up the project on a new machine or switching between Home/Office networks:
```bash
# From server directory
npm run verify:env
```

### Run Full Test Suite
To run all tests including unit, integration, and e2e:
```bash
# From root
npm test
npm run test:e2e
npm run integration-test
```

### Debug Database Connection
If `npm start` fails with a DB timeout:
```bash
# From server directory
node scripts/test-db-connection.js
```
