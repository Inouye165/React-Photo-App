# Scalability & Architecture Report

This document outlines the architectural decisions and optimizations implemented to ensure Lumina scales reliably from 1 to 10,000+ concurrent users.

## 1. Memory Safety (Streaming Architecture)
**Problem:** Previous versions buffered entire file uploads (up to 50MB) into RAM before processing. A concurrent load of 20 users could exhaust server memory (OOM).
**Solution:**
- **Uploads:** Implemented `multer.diskStorage` with streaming. Incoming files are piped to temporary disk storage, keeping RAM usage constant regardless of file size.
- **AI Processing:** Refactored the OpenAI vision pipeline to stream files from storage, resize them on-the-fly using `sharp` (limiting to 2048px), and buffer only the optimized image.
- **Error Recovery:** Storage move fallbacks now utilize strict stream piping to prevent memory spikes even during exception handling. When a storage move operation fails, the system downloads and re-uploads the file using Node.js Readable streams instead of loading the entire file into memory as a Buffer/ArrayBuffer. This ensures resilience during error scenarios without risking OOM conditions.
- **Display Endpoints:** Photo, chat-image, and thumbnail display endpoints now prefer **HTTP redirects to short-lived Supabase Storage signed URLs** (offloading image bytes from the Node.js hot path). They fall back to server-side streaming on redirect/signed-URL errors. For HEIC/HEIF, the worker generates a private JPEG “display asset” once and stores its path in `photos.display_path`, allowing the display endpoints to redirect/stream the JPEG as well. `raw=1` remains a fetch/credentials-safe bypass that streams bytes directly (no cross-origin redirect).
**Result:** The application is now resilient to OOM crashes, even when handling massive HEIC/RAW files under load and during storage error recovery operations.

## 2. Concurrency Control (Atomic Operations)
**Problem:** File uploads previously used a "Check-then-Act" pattern (`list` files -> `upload`), creating race conditions where simultaneous uploads could overwrite data or crash.
**Solution:**
- Refactored uploads to use an **Atomic Loop**. The server attempts to upload with a "no-overwrite" flag.
- If the storage provider rejects the write (collision), the server catches the specific error, increments a version counter, and retries.
**Result:** Zero data loss or corruption during high-concurrency "flash crowd" upload scenarios.

## 3. Decoupled Worker Architecture
**Problem:** Heavy tasks (HEIC conversion, AI analysis) are CPU-intensive. Running them on the API server blocked the Event Loop, causing UI lag for all users.
**Solution:**
- **Strict Separation:** The codebase is split into two distinct process types defined in `Procfile`:
    - `web`: Handles HTTP requests and enqueues jobs.
    - `worker`: Consumes jobs from Redis and performs heavy processing.
- **Resilience:** Implemented a "Try Queue, Fallback to Sync" pattern. If Redis is temporarily unavailable, the API server gracefully falls back to processing the job synchronously, ensuring 100% uptime for users.
- **Horizontal Scaling:** These processes can be scaled independently (e.g., 2 web nodes, 5 worker nodes) based on traffic vs. processing backlog.

## 4. Database Connection Pooling
**Problem:** Default connection limits were hardcoded (10 connections). High traffic would cause request timeouts waiting for a DB handle.
**Solution:**
- **Configurable Pool:** Production configuration now uses `DB_POOL_MIN` and `DB_POOL_MAX` environment variables.
- **Tuning:** This allows the application to be tuned to match the specific PostgreSQL tier (e.g., Supabase Transaction Pooler) without code changes.

## 5. Caching Strategy (Redis Result Cache)
**Problem:** Listing large photo libraries can create sustained database load (repeated `GET /photos` refreshes, pagination, polling).

**Solution:** Implemented a Redis-backed result cache at the **service layer** (`photosDb.listPhotos`) to reduce repeated DB reads.

- **Cache Key:** `photos:list:{userId}:{cursor}:{limit}`
    - `userId` is normalized and scoped to the authenticated user.
    - `cursor` is stored as a hashed token (derived from validated query state + cursor tuple) to avoid embedding raw user input in keys.
    - `limit` is the validated/capped page size.
- **TTL:** 300 seconds (5 minutes).
- **Routing Note:** The previous short-lived route-level micro-cache was removed to avoid double-caching and to keep `X-Cache` behavior consistent; the route now reflects the service-layer cache hit/miss.
- **Atomic-ish Writes:** Prefer `MULTI/EXEC` when supported to set the cached value and record the key in a per-user index set.
- **Invalidation:** On successful upload, delete, or list-affecting updates, the cache is invalidated **per user** using a Redis Set index (`photos:list:keys:{userId}`), avoiding `KEYS/SCAN` on the hot path.
- **Resilience:** If Redis is not configured or is temporarily unavailable, the application gracefully falls back to direct DB queries (cache is best-effort).

## 6. Error Handling & Resilience
**Goal:** Preserve correct behavior under partial failures (Redis down, worker stalls) and reduce security risk from stale auth state.

- **Auth Profile Cache (Security-Sensitive):**
    - Cached Supabase user profile is stored under `auth:profile:{tokenHash}` with TTL 300s (token is hashed; raw tokens never appear in Redis keys).
    - **Immediate invalidation support:** per-user index set (`auth:profile:keys:{userId}`) + an `auth:profile:invalidatedAt:{userId}` guard.
    - On a security event (role change, revocation, etc.), call `invalidateAuthProfileCacheForUserId(userId)` to evict known cached entries and prevent older cached profiles from being reused.
    - **Fail-open:** if Redis is unavailable or cache entries are malformed, auth falls back to `supabase.auth.getUser()`.

- **Worker Lock Hardening (BullMQ):**
    - `lockDuration = 60s` and `stalledInterval = 30s` to detect stuck workers faster and reduce “ghost ownership” windows.
    - Retry behavior is configured at job enqueue time (`attempts = 5`, exponential backoff with 60s delay).

## 7. Monitoring & Tracing
**Goal:** Make production incidents diagnosable with low-cardinality signals.

- **Request Correlation:** A sanitized `x-request-id` is attached to each request and echoed in the response header. When the API enqueues an AI job, it propagates the same request ID into the job payload, and the worker includes it in job completion/failure logs.
- **Metrics:** Prometheus-style metrics are exposed via `/metrics` and include BullMQ worker/job counters and duration histograms.

## Summary of Limits
| Resource | Old Limit | New Limit | Bottleneck Removed |
| :--- | :--- | :--- | :--- |
| **Concurrent Uploads** | ~10-20 (RAM bound) | Disk I/O bound (High) | Streaming |
| **AI Jobs** | Blocked Web Server | Asynchronous / Scalable | Worker Process |
| **DB Connections** | Fixed (10) | Configurable (e.g., 50+) | Pooling Env Vars |