# Problem Log

## Issue: Local sandbox setup on laptop required env + port corrections

**Date:** February 8, 2026 (Laptop)
**Symptom:** `knex migrate:latest` timed out with `Knex: Timeout acquiring a connection`, backend/worker reported DB connection failures, and Supabase storage checks failed.
**Context:** Local Supabase was running, but the DB port from `supabase status` did not match the actual Docker port mapping. The server `.env` still pointed at the Docker Compose Postgres defaults instead of the Supabase DB port, causing connection timeouts.

**Resolution:**
- Confirmed actual Supabase DB port with `docker ps`.
- Updated `SUPABASE_DB_URL` and `SUPABASE_DB_URL_MIGRATIONS` to the mapped DB port.
- Kept `DB_SSL_DISABLED=true` for local Postgres/Supabase.

**How to validate:**
- `npx knex migrate:latest --knexfile knexfile.js` returns `Already up to date`.
- Backend logs show `[db] Database connection verified`.

## Issue: Worker failed to start because REDIS_URL missing

**Date:** February 8, 2026 (Laptop)
**Symptom:** Worker crashed with `Redis connection required to start worker` and queue disabled logs.
**Context:** Redis container was running, but `REDIS_URL` was missing in `server/.env`.

**Resolution:**
- Set `REDIS_URL=redis://localhost:6379` in `server/.env`.

**How to validate:**
- Worker starts without Redis errors.
- Backend logs show photo status subscriber started.

## Issue: Node version out of range causes install warnings

**Date:** February 8, 2026 (Laptop)
**Symptom:** `npm install` shows `EBADENGINE Unsupported engine` warnings.
**Context:** Local Node version was `v24.9.0`, while repo requires `>=20.11 <23`.

**Resolution:**
- Pin Node 20 (nvm-windows or Volta) before installing dependencies.

**How to validate:**
- `node -v` reports 20.x.
- `npm install` completes without EBADENGINE warnings.

## Issue: Redis not reachable (ECONNREFUSED) during local sandbox startup

**Date:** February 8, 2026
**Symptom:** Backend and worker log repeated `ECONNREFUSED` / `Redis connection required to start worker` while starting the local sandbox.
**Context:** `docker-compose up -d db redis` failed with `Bind for 0.0.0.0:6379 failed: port is already allocated`. A pre-existing container (`local-redis`) was already publishing 6379, and a stale `photo-app-redis` container existed without a published port.

**Resolution:**
- Stop/remove the conflicting container (`local-redis`).
- Remove the stale `photo-app-redis` container and re-run `docker-compose up -d redis`.
- Verify Redis port is published (e.g., `docker ps` shows `0.0.0.0:6379->6379/tcp`).

**How to validate:**
- Backend starts without Redis errors.
- Worker starts and connects to Redis successfully.

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

## Issue: Legitimate HEIC/HEIF uploads rejected with 415 after streaming-upload refactor

**Date:** December 27, 2025
**Symptom:** Uploading a real HEIC/HEIF sometimes fails with `415 Unsupported Media Type` (often when the browser reports `File.type` as empty or `application/octet-stream`).

**Root Cause:** The streaming upload pipeline enforced a strict allowlist on the *claimed* MIME type before running magic-byte signature validation. This caused legitimate uploads to be rejected when the browser supplied an empty/unknown MIME.

**Resolution (security-first):**
- Backend: only bypass the early claimed-MIME allowlist check when the claimed MIME is unknown (`''` or `application/octet-stream`) and rely on magic-byte detection to allowlist/deny (still fail-closed).
- Backend: expanded ISO BMFF `ftyp` brand detection for HEIC/HEIF variants so real-world files validate reliably.
- Frontend: when `File.type` is empty, infer a best-effort MIME from the filename extension (e.g., `.HEIC` → `image/heic`) by wrapping the original in a new `File`.

**Tests added/updated:**
- Server: streaming upload tests covering unknown claimed MIME + valid HEIC signature (allowed) and unknown claimed MIME + non-image bytes (rejected with `INVALID_FILE_SIGNATURE`).
- Frontend: `uploadPhotoToServer` unit test verifying empty `File.type` is inferred from `.HEIC`.

