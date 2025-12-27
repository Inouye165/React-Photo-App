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

## Issue: CDN redirect tests failing due to Knex mock not tracking `where(column, value)`

**Date:** December 27, 2025
**Symptom:** New CDN redirect integration tests for `/display/image/:photoId` and `/display/chat-image/:roomId/:photoId` returned incorrect behavior (e.g., HEIC conversion not invoked, chat-image 404s) even though route logic was correct.
**Root Cause:** The Jest DB mock in `server/tests/__mocks__/knex.js` only tracked `where({ ... })` calls, but the display routes use Knex's common `where('column', value)` / `andWhere('column', value)` signatures. As a result, queries didn't filter and returned the first default photo.
**Resolution:** Updated the mock `where` implementation to record both object-based and `(column, value)` signatures.

