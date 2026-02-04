# Local Sandbox Setup Guide

This guide documents a full local sandbox setup for the app, plus common issues and fixes encountered during startup.

## Prerequisites

- Node.js 20+
- Docker Desktop (running)

## Quick Setup (Checklist)

1. **Start Docker services (Postgres + Redis)**
   - `docker-compose up -d db redis`
2. **Install dependencies**
   - Repo root: `npm install`
   - Server: `cd server && npm install && cd ..`
3. **Create env files**
   - `cp server/.env.example server/.env`
   - Fill in required keys (`OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `JWT_SECRET`, etc.)
4. **Run migrations**
   - `cd server && npx knex migrate:latest --knexfile knexfile.js && cd ..`
5. **Start the app (3 terminals)**
   - Frontend: `npm run dev`
   - Backend: `cd server && npm run dev`
   - Worker: `cd server && npm run worker`
6. **Open the app**
   - http://localhost:5173/

---

## Problems & Fixes

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

### 3) Backend fails to start: port 3001 in use
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
