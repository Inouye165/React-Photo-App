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
