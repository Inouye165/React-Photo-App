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

## Issue: HEIC conversion on request path (latency + CPU/memory spikes)

**Date:** December 27, 2025

**Root cause:** HEIC/HEIF files were being converted to JPEG during `GET /display/image/:photoId` and `GET /display/chat-image/:roomId/:photoId`. This pushes expensive decode/encode work onto the web request path, increasing tail latency, CPU usage, memory pressure, and reducing concurrency under load.

**Solution:** Generate a private JPEG “display asset” in the background worker once per HEIC/HEIF upload. The worker uploads the JPEG to a deterministic storage path and sets `photos.display_path`. Display endpoints then prefer `display_path`:
- Normal (`raw` not set): redirect to a short-lived Supabase signed URL for the effective path
- `raw=1`: stream bytes from storage for the effective path (fetch/credentials-safe)
- Temporary fallback: if the original is HEIC/HEIF and `display_path` is missing, keep legacy request-time convert+stream until rollout coverage is complete

**Tests added:**
- `server/tests/display.cdnRedirect.integration.test.js` (HEIC uses `display_path` when present; converter not called; fallback conversion still works)
- `server/tests/heicDisplayAsset.worker.test.js` (HEIC worker path: download → convert → upload → DB update; idempotent when `display_path` exists)

**How to validate manually:**
- Upload a HEIC/HEIF and wait for the worker to finish processing
- Confirm `photos.display_path` is populated (DB)
- Open the photo normally: `/display/image/:photoId` should redirect to a signed URL for `display/...jpg`
- Fetch-safe path: `/display/image/:photoId?raw=1` should return `200` with `Content-Type: image/jpeg`

