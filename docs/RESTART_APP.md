# Restarting the App (Local Sandbox)

This is a **restart-only** checklist. It assumes the sandbox environment and dependencies are already installed and configured.

## 0) Check local Supabase migrations (recommended)

From the repo root:

- `npm run check:supabase:migrations`

If it reports pending migrations, run:

- `supabase db push --local`

## 1) Start required services

From the repo root:

- Start Postgres + Redis:
  - `docker-compose up -d db redis`

### One-command startup (recommended)

From the repo root:

- `npm run start:local`

What it does:

- Ensures `supabase start` is running
- Checks for pending local Supabase migrations
- Applies migrations automatically (`supabase db push --local --yes`) when needed
- Starts backend API, worker, and frontend with prefixed logs in one terminal

## 2) Start backend API

From the repo root (new terminal):

- `npm --prefix server start`

Expected: API health at http://127.0.0.1:3001/health

## 3) Start background worker

From the repo root (new terminal):

- `npm run worker`

## 4) Start frontend

From the repo root (new terminal):

- `npm run dev`

Expected: Frontend at http://localhost:5173/

## 5) Quick status checks (optional)

- API: http://127.0.0.1:3001/health
- Frontend: http://localhost:5173/

## Notes

- If the backend fails prestart checks, verify DB/Redis are running and `server/.env` is valid.
- If the worker can’t connect to Redis, ensure `REDIS_URL=redis://localhost:6379` in `server/.env`.
