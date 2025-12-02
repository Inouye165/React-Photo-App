# Problem Log

## Issue: Database Connection Failure (SSL)

**Date:** December 2, 2025
**Symptom:** `knex migrate:latest` fails with `The server does not support SSL connections`.
**Context:**
- Workspace was reset to `origin/main`.
- `server/knexfile.js` forces SSL in development (`return { rejectUnauthorized: false }`).
- Local Docker Postgres container (standard `postgres:15-alpine`) does not support SSL.
- User reports this same code works on another machine (Home).

**Resolution:**
- Modified `server/knexfile.js` to disable SSL in development.

**Action Item:**
- [ ] **Verify Home Setup:** Check the Home machine's `server/knexfile.js` and Docker configuration. It is likely that the Home machine has uncommitted changes to `knexfile.js` or a custom Postgres config that supports SSL.
