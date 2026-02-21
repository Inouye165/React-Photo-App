# Restarting the App (Local Sandbox)

This is a **restart-only** checklist. It assumes the sandbox environment and dependencies are already installed and configured.

## Fast path (Windows)

From repo root:

- `npm run start:local`

This starts Docker services, waits for readiness, and opens separate terminals for API, worker, and frontend.

To stop everything started by the fast path:

- `npm run stop:local`

## 1) Start required services

From the repo root:

- Start Postgres + Redis:
  - `docker-compose up -d db redis`

## 2) Start backend API

From the repo root (**terminal 1**):

- `npm --prefix server start`

Expected: API health at http://127.0.0.1:3001/health

## 3) Start background worker

From the repo root (**terminal 2**):

- `npm run worker`

## 4) Start frontend

From the repo root (**terminal 3**):

- `npm run dev`

Expected: Frontend at http://localhost:5173/

## 5) Quick status checks (optional)

- API: http://127.0.0.1:3001/health
- Frontend: http://localhost:5173/

## Notes

- If the backend fails prestart checks, verify DB/Redis are running and `server/.env` is valid.
- If the worker can’t connect to Redis, ensure `REDIS_URL=redis://localhost:6379` in `server/.env`.

## Startup Tracking Log

### 2026-02-21 05:26:54 -08:00 — Desktop session

- **Environment:** Desktop (Windows)
- **Branch:** `main`
- **HEAD:** `1a6d651`
- **Latest merged PR on main at time of session:** `#677` (`Merge pull request #677 from Inouye165/feat/chess-moves-panel-responsive`)

#### Issues observed today

1. **Git sync blocked on pull**
  - **Symptom:** `git pull origin main` aborted because local edits would be overwritten.
  - **Resolution:** Stashed local changes (`git stash push -u`), then pulled with fast-forward.

2. **Frontend auth failures at startup**
  - **Symptom:** Browser repeatedly showed `ERR_CONNECTION_REFUSED` for `127.0.0.1:54321/auth/v1/token`.
  - **Resolution:** Started local Supabase and verified auth endpoint health before app login flow.

3. **Supabase restart conflict**
  - **Symptom:** `supabase start` failed with container name conflict (`supabase_vector_photo-app`).
  - **Resolution:** Ran self-heal flow: `supabase stop --no-backup`, removed stale `supabase_*` containers, restarted Supabase.

4. **Backend migration failed with `schema "auth" does not exist`**
  - **Symptom:** Server startup migration (`20260220164500_fix_chat_rooms_select_creator_and_last_read_at.js`) failed.
  - **Cause:** Backend was pointed to local Docker Postgres (`:5432`) instead of local Supabase Postgres (`:54330`) during that run.
  - **Resolution:** Restarted backend with DB env overrides targeting `postgresql://postgres:postgres@127.0.0.1:54330/postgres`; migration applied successfully.

5. **Wrong-version notes cleanup request**
  - **Symptom:** Prior comments/results from wrong code context needed removal.
  - **Resolution:** Removed stale startup notes from this file and reran clean startup validation.

#### Preventive hardening kept

- Added frontend preflight guard script: `scripts/ensure-local-supabase-ready.cjs`.
- Added `predev` hook in root `package.json` so `npm run dev` checks local Supabase auth health and starts Supabase if needed.

#### End state (verified)

- Supabase auth health reachable: `http://127.0.0.1:54321/auth/v1/health`
- Backend health reachable: `http://127.0.0.1:3001/health`
- Frontend reachable: `http://localhost:5173/`
