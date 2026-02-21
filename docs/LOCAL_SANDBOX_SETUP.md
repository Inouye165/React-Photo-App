# Local Sandbox Setup Guide

This guide documents a full local sandbox setup for the app, plus common issues and fixes encountered during startup.

## Prerequisites

- Node.js **20.11+ and <23** (required)
   - If you see engine warnings during `npm install`, you are likely on Node 23+.
   - Use nvm-windows or Volta to pin Node 20 for this repo.
- npm 10+
- Docker Desktop (running)

> **Why this matters:** Using Node 23+ can cause install or runtime failures.

## Quick Setup (Checklist)

1. **Start Docker services (Postgres + Redis)**
   - `docker-compose up -d db redis`
   - If you use local Supabase for Postgres, you can skip the `db` service and run only Redis: `docker-compose up -d redis`.
2. **Install dependencies (always after a pull)**
   - Repo root: `npm install`
   - Server: `cd server && npm install && cd ..`
3. **Create env file**
    - If you already have a server env file, back it up first:
       - PowerShell: `Copy-Item server\.env server\.env.backup-YYYYMMDD-HHMMSS`
    - Create the new env file:
       - `cp server/.env.example server/.env`
    - Set local DB + Redis values for Docker Compose:
       - `SUPABASE_DB_URL=postgresql://photoapp:photoapp_dev@localhost:5432/photoapp`
       - `SUPABASE_DB_URL_MIGRATIONS=postgresql://photoapp:photoapp_dev@localhost:5432/photoapp`
       - `DB_SSL_DISABLED=true`
       - `REDIS_URL=redis://localhost:6379`
    - Fill in required keys: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `JWT_SECRET`.
       - If you do not set Supabase values, storage/auth features will fail (see [docs/LOCAL_SUPABASE.md](docs/LOCAL_SUPABASE.md)).
       - If you are using local Supabase, pull the values via `supabase status --output json` and update the DB URL + keys to match that output.
4. **Run migrations**
   - `cd server && npx knex migrate:latest --knexfile knexfile.js && cd ..`
5. **Start the app (3 terminals)**
   - Frontend: `npm run dev`
   - Backend: `cd server && npm run dev`
   - Worker: `cd server && npm run worker`
6. **Open the app**
   - App: http://localhost:5173/
   - If 5173 is busy, Vite will pick the next port (check the terminal).

---

## Problems & Fixes
### 0) Missing dependencies after a pull (most common)
**Symptom:**
`Cannot find module 'yjs'` or `Failed to resolve import "@excalidraw/excalidraw"`.

**Fix:**
- Re-run installs **in both places**:
   - `npm install`
   - `cd server && npm install && cd ..`


### 1) Redis container name conflict
**Symptom:**
`Error response from daemon: Conflict. The container name "/photo-app-redis" is already in use`

**Fix:**
- Check existing container: `docker ps -a --filter name=photo-app-redis`
- Stop or remove it: `docker stop photo-app-redis` then `docker rm photo-app-redis`

---

### 2) Worker fails to start: REDIS_URL required
**Symptom:**
`Redis connection required to start worker`

**Fix:**
- Ensure Redis container is running.
- Set `REDIS_URL` in the server environment, e.g.
  - PowerShell (current session): `$env:REDIS_URL="redis://localhost:6379"`
  - Or add to `server/.env` for persistence.

---

### 3) Knex migration timeout (local Docker Postgres)
**Symptom:**
`Knex: Timeout acquiring a connection`

**Fix:**
- Ensure DB URL uses Docker Compose credentials:
   - `SUPABASE_DB_URL=postgresql://photoapp:photoapp_dev@localhost:5432/photoapp`
   - `SUPABASE_DB_URL_MIGRATIONS=postgresql://photoapp:photoapp_dev@localhost:5432/photoapp`
- Disable SSL for local Postgres:
   - `DB_SSL_DISABLED=true`

---

### 4) Backend fails to start: port 3001 in use
**Symptom:**
`listen EADDRINUSE: address already in use :::3001`

**Fix:**
- Find the process using port 3001 and stop it.
- Or change the backend `PORT` in `server/.env` to a free port (e.g. 3002) and restart.

---

## Notes

- The worker must be running or thumbnails won’t process.
- Missing Google Maps keys disables POI lookups.
- The backend requires an OpenAI key unless in test mode.
- Media redirects are controlled via `MEDIA_REDIRECT_ENABLED` in `server/.env`.

## Local Supabase Dashboard

If you run the local Supabase stack, the dashboard (Studio) is available here:
- Supabase Studio: http://localhost:54323/

See [docs/LOCAL_SUPABASE.md](docs/LOCAL_SUPABASE.md) for the full local Supabase setup steps.
---

## Incident Log

### 2026-02-21 — Chat messages silently disappear after every send

**Symptom:**
- Chat send appeared to succeed (`sendMessage` returned an id, DB row confirmed present).
- No messages ever appeared in the chat UI — on first load or after send.
- Realtime subscription confirmed SUBSCRIBED. No JS errors.
- `useChatRealtime` logs showed `rowCount=3 → MAPPED 0 messages`.

**Root cause:**
`src/types/chat.ts` declared `MessageId = number`. The `messages` table uses UUID (`gen_random_uuid()`) primary keys — strings like `2d155999-e877-4ea8-bdb9-e2f75c9c6132`. The `asChatMessage()` validator called `Number('2d155999...')` which is `NaN`, so it returned `null` for every single row — both on initial DB fetch and on every Realtime INSERT event. Zero messages ever entered React state.

**Why it wasn't caught immediately:**
The type mismatch is invisible at runtime without schema-aware logging. Previous debugging focused on credential issues (wrong anon key, wrong JWT secret, wrong DB URL) which were also real bugs. After credentials were fixed, messages began reaching the DB — but the display still failed due to this unrelated mapping bug. The mapping layer had no log output until comprehensive tracing was added, at which point `MAPPED 0 messages` was immediately obvious.

**The schema was NOT altered.** The DB was always correct (UUID PKs). The TypeScript type was wrong. Fix was pure frontend code:
- `src/types/chat.ts`: `MessageId = number` → `MessageId = string`
- `src/utils/chatUtils.ts` `asChatMessage()`: validate `id` as a non-empty string instead of `toFiniteNumber()`
- `src/utils/chatUtils.ts` `sortMessages()`: tie-breaker changed from `a.id - b.id` (arithmetic, breaks on strings) to lexicographic comparison

**Files changed:** `src/types/chat.ts`, `src/utils/chatUtils.ts`

**Diagnosis shortcut for future:** If messages reach the DB (confirm with `docker exec supabase_db_photo-app psql -U postgres -d postgres -c "SELECT id, content FROM messages ORDER BY created_at DESC LIMIT 5;"`) but the UI shows nothing, add this one log line immediately:
```ts
console.log('[DEBUG] mapped', (data ?? []).map(asChatMessage))
```
If it logs all `null`, the issue is in `asChatMessage()` — check that the type of `id` in `ChatMessage` matches what the DB actually returns (UUID string vs integer).

**One-shot triage pack (capture this on first pass next time):**
Collect these in one attempt before changing code:
1. **Send-path proof**
   - `onSend` click log (roomId, draft, sending)
   - `sendMessage` start + success/error (including inserted `id`)
2. **DB proof**
   - `SELECT id, room_id, sender_id, content, created_at FROM public.messages ORDER BY created_at DESC LIMIT 5;`
3. **Fetch mapping proof**
   - `FETCH result: rowCount=<n>`
   - `MAPPED <n> messages`
   - One sample row shape (`typeof id`, `typeof created_at`, etc.)
4. **Realtime proof**
   - Subscription status (`SUBSCRIBED`)
   - Realtime payload sample + result of `asChatMessage(payload.new)`
5. **Schema/type proof**
   - Confirm DB id type: `SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='id';`
   - Compare to TS type in `src/types/chat.ts` (`MessageId`)

If steps 1-4 show: **send success + DB row exists + fetch rowCount > 0 + mapped 0**, this points directly to a mapping/type mismatch (not RLS, not migrations, not transport).

---

### 2026-02-21 — Local vs Production schema drift (RESOLVED)

**Initial concern:** A ChatGPT session compared an older local schema snapshot to production and found 10+ differences (missing tables, conflicting RLS/realtime settings).

**Actual verified state (checked 2026-02-21 after `supabase stop/start`):**
Local and production are **identical** — 17 tables, matching RLS and realtime settings on every table.

The differences described in ChatGPT were from a stale local DB that pre-dated migrations `20260220120000` through `20260220181500`. After those migrations ran on restart, the schemas fully converged.

**Verification query** (run against local Supabase to confirm schema parity):
```sql
SELECT t.table_name, c.relrowsecurity AS rls_enabled,
  CASE WHEN pr.tablename IS NOT NULL THEN true ELSE false END AS realtime_enabled
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_publication_tables pr 
  ON pr.tablename = t.table_name AND pr.pubname = 'supabase_realtime'
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
```
Expected result: 17 rows, all matching production's table list and RLS/realtime flags.

**Golden rule going forward:** Every schema change goes through a migration file — no manual Supabase dashboard edits. Use `supabase db diff` after any manual change to capture it as a migration immediately.